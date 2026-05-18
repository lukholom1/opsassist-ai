import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SubmitSchema = z.object({
  user_name: z.string().trim().min(1).max(100),
  title: z.string().trim().min(3).max(200),
  details: z.string().trim().min(5).max(2000),
});

const CATEGORIES = ["HR", "IT", "Finance", "Operations"] as const;
const PRIORITIES = ["High", "Medium", "Low"] as const;

type Classification = {
  category: (typeof CATEGORIES)[number];
  priority: (typeof PRIORITIES)[number];
};

// Heuristic fallback if AI fails — keeps the demo robust offline.
function heuristicClassify(title: string, details: string): Classification {
  const text = `${title} ${details}`.toLowerCase();
  let category: Classification["category"] = "Operations";
  if (/(payroll|salary|leave|hr|hiring|benefit|vacation|holiday)/.test(text)) category = "HR";
  else if (/(laptop|wifi|vpn|server|password|login|software|computer|email|network|system|bug)/.test(text)) category = "IT";
  else if (/(invoice|payment|reimburs|finance|budget|expense|tax|refund)/.test(text)) category = "Finance";

  let priority: Classification["priority"] = "Medium";
  if (/(urgent|asap|immediately|critical|down|outage|cannot work|blocker|emergency)/.test(text)) priority = "High";
  else if (/(whenever|low priority|minor|nice to have|sometime)/.test(text)) priority = "Low";
  return { category, priority };
}

async function classifyWithAI(title: string, details: string): Promise<Classification> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return heuristicClassify(title, details);

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You classify business support tickets. Respond ONLY with strict JSON like {\"category\":\"HR|IT|Finance|Operations\",\"priority\":\"High|Medium|Low\"}. Pick category by topic and priority by urgency/wording.",
          },
          {
            role: "user",
            content: `Title: ${title}\nDetails: ${details}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("AI gateway error", res.status, await res.text());
      return heuristicClassify(title, details);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Partial<Classification>;
    const category = CATEGORIES.includes(parsed.category as never)
      ? (parsed.category as Classification["category"])
      : heuristicClassify(title, details).category;
    const priority = PRIORITIES.includes(parsed.priority as never)
      ? (parsed.priority as Classification["priority"])
      : heuristicClassify(title, details).priority;
    return { category, priority };
  } catch (e) {
    console.error("Classification failed", e);
    return heuristicClassify(title, details);
  }
}

// Submit a ticket: classify via AI then insert.
export const submitTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data }) => {
    const { category, priority } = await classifyWithAI(data.title, data.details);
    const { data: row, error } = await supabaseAdmin
      .from("tickets")
      .insert({
        user_name: data.user_name,
        title: data.title,
        details: data.details,
        category,
        priority,
      })
      .select("id, category, priority, created_at")
      .single();
    if (error) {
      console.error(error);
      throw new Error("Failed to save ticket");
    }
    return { id: row.id, category: row.category, priority: row.priority };
  });

// List all tickets (admin dashboard).
export const listTickets = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return { tickets: data ?? [] };
});

// Update a ticket's progress status (admin only — gated by password in UI).
const STATUSES = ["Open", "In Progress", "Resolved"] as const;
const UpdateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export const updateTicketStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateStatusSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("tickets")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id, status: data.status };
  });

// ---------- AI Response Generator ----------
// Generates a professional reply tailored to ticket category + chosen tone.

const TONES = ["formal", "friendly", "urgent"] as const;
const GenerateResponseSchema = z.object({
  ticket_id: z.string().uuid().optional(),
  user_name: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(1).max(50),
  priority: z.string().trim().min(1).max(20),
  tone: z.enum(TONES),
});

// Category-specific guidance baked into the prompt so replies feel routed.
const CATEGORY_GUIDANCE: Record<string, string> = {
  IT: "You represent the IT Support team. Reference troubleshooting steps, ticket triage, and expected resolution windows.",
  HR: "You represent the HR team. Be empathetic, confidential, and reference relevant policies or next steps.",
  Finance: "You represent the Finance team. Be precise about amounts, documentation, and approval workflows.",
  Operations: "You represent the Operations team. Focus on coordination, ownership, and timeline clarity.",
};

const TONE_GUIDANCE: Record<(typeof TONES)[number], string> = {
  formal: "Use a professional, business-formal tone. Full sentences, no contractions, courteous closing.",
  friendly: "Use a warm, conversational tone. Approachable language, light contractions, reassuring.",
  urgent: "Use a direct, action-oriented tone. Acknowledge urgency, commit to immediate next steps, short sentences.",
};

// Template fallback used if the AI is unavailable — keeps the feature reliable offline.
function templateResponse(input: z.infer<typeof GenerateResponseSchema>): string {
  const team = input.category === "IT"
    ? "IT Support"
    : input.category === "HR"
      ? "People & Culture"
      : input.category === "Finance"
        ? "Finance"
        : "Operations";
  const opener = input.tone === "friendly"
    ? `Hi ${input.user_name}, thanks so much for reaching out!`
    : input.tone === "urgent"
      ? `Hello ${input.user_name}, we've flagged your request as urgent and are acting on it now.`
      : `Dear ${input.user_name},\n\nThank you for contacting the ${team} team.`;
  const body = `We've received your request regarding "${input.title}" and routed it to ${team}. A team member will follow up with next steps shortly.`;
  const closing = input.tone === "formal"
    ? `\n\nKind regards,\nThe ${team} Team`
    : input.tone === "urgent"
      ? `\n\nExpect an update within the hour.\n— ${team}`
      : `\n\nTalk soon,\nThe ${team} Team`;
  return `${opener}\n\n${body}${closing}`;
}

export const generateTicketResponse = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GenerateResponseSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { response: templateResponse(data), source: "template" as const };

    const categoryHint = CATEGORY_GUIDANCE[data.category] ?? `You represent the ${data.category} team.`;
    const toneHint = TONE_GUIDANCE[data.tone];

    const system = [
      "You are an AI assistant that writes professional reply messages from a support team to an employee who submitted a ticket.",
      categoryHint,
      toneHint,
      "Keep the reply between 60 and 140 words. Address the user by their first name. Acknowledge the issue, confirm routing, and outline clear next steps. Do not invent specific times, names, or ticket numbers. End with a signature line for the team.",
      "Output plain text only — no markdown, no preamble like 'Here is...', just the reply itself.",
    ].join(" ");

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: `User: ${data.user_name}\nCategory: ${data.category}\nPriority: ${data.priority}\nTitle: ${data.title}\nDetails: ${data.details}\n\nWrite the reply now.`,
            },
          ],
        }),
      });
      if (!res.ok) {
        console.error("AI response gen failed", res.status, await res.text());
        return { response: templateResponse(data), source: "template" as const };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) return { response: templateResponse(data), source: "template" as const };
      return { response: content, source: "ai" as const };
    } catch (e) {
      console.error("AI response gen error", e);
      return { response: templateResponse(data), source: "template" as const };
    }
  });

