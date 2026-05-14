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
