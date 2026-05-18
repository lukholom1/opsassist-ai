import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./auth-helpers.server";

const CATEGORIES = ["HR", "IT", "Finance", "Operations"] as const;
const PRIORITIES = ["High", "Medium", "Low"] as const;
const STATUSES = ["Open", "In Progress", "Resolved"] as const;
const TONES = ["formal", "friendly", "urgent"] as const;

type Category = (typeof CATEGORIES)[number];
type Priority = (typeof PRIORITIES)[number];
type Tone = (typeof TONES)[number];

// ----------------------------- Classification -----------------------------

function heuristicClassify(title: string, details: string): { category: Category; priority: Priority } {
  const text = `${title} ${details}`.toLowerCase();
  let category: Category = "Operations";
  if (/(payroll|salary|leave|hr|hiring|benefit|vacation|holiday)/.test(text)) category = "HR";
  else if (/(laptop|wifi|vpn|server|password|login|software|computer|email|network|system|bug|outage)/.test(text)) category = "IT";
  else if (/(invoice|payment|reimburs|finance|budget|expense|tax|refund)/.test(text)) category = "Finance";

  let priority: Priority = "Medium";
  if (/(urgent|asap|immediately|critical|down|outage|cannot work|blocker|emergency)/.test(text)) priority = "High";
  else if (/(whenever|low priority|minor|nice to have|sometime)/.test(text)) priority = "Low";
  return { category, priority };
}

async function classifyWithAI(title: string, details: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return heuristicClassify(title, details);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              'Classify business support tickets. Respond ONLY with strict JSON like {"category":"HR|IT|Finance|Operations","priority":"High|Medium|Low"}.',
          },
          { role: "user", content: `Title: ${title}\nDetails: ${details}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return heuristicClassify(title, details);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    const fb = heuristicClassify(title, details);
    return {
      category: (CATEGORIES.includes(parsed.category) ? parsed.category : fb.category) as Category,
      priority: (PRIORITIES.includes(parsed.priority) ? parsed.priority : fb.priority) as Priority,
    };
  } catch {
    return heuristicClassify(title, details);
  }
}

// ----------------------------- Assignment (load balanced) -----------------------------

// Returns the IT personnel user_id with the fewest active (Open/In Progress) tickets, or null.
async function pickLeastBusyItPersonnel(): Promise<string | null> {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "it_personnel");
  const ids = (roles ?? []).map((r) => r.user_id);
  if (ids.length === 0) return null;

  const { data: active } = await supabaseAdmin
    .from("tickets")
    .select("assigned_to")
    .in("status", ["Open", "In Progress"])
    .in("assigned_to", ids);

  const counts = new Map(ids.map((id) => [id, 0] as [string, number]));
  for (const row of active ?? []) {
    if (row.assigned_to) counts.set(row.assigned_to, (counts.get(row.assigned_to) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

// ----------------------------- Submit ticket (authenticated) -----------------------------

const SubmitSchema = z.object({
  title: z.string().trim().min(3).max(200),
  details: z.string().trim().min(5).max(2000),
});

export const submitTicket = createServerFn({ method: "POST" })
  .middleware([requireRole(["employee", "admin", "it_personnel"])])
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { category, priority } = await classifyWithAI(data.title, data.details);
    // Auto-assign IT tickets to least-busy IT personnel.
    const assigned_to = category === "IT" ? await pickLeastBusyItPersonnel() : null;
    const userName = context.profile?.full_name ?? "User";

    const { data: row, error } = await supabaseAdmin
      .from("tickets")
      .insert({
        user_id: context.userId,
        user_name: userName,
        title: data.title,
        details: data.details,
        category,
        priority,
        assigned_to,
      })
      .select("id, category, priority, status, assigned_to, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, category: row.category, priority: row.priority, assigned_to: row.assigned_to };
  });

// ----------------------------- Listing -----------------------------

// Helper: enrich tickets with assignee profiles.
async function enrich(rows: Array<{ assigned_to: string | null; user_id: string | null }>) {
  const ids = Array.from(
    new Set(
      rows.flatMap((r) => [r.assigned_to, r.user_id]).filter((v): v is string => Boolean(v)),
    ),
  );
  if (ids.length === 0) return new Map<string, { id: string; full_name: string }>();
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

// Caller's own tickets.
export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const profiles = await enrich(data ?? []);
    return {
      tickets: (data ?? []).map((t) => ({
        ...t,
        assignee_name: t.assigned_to ? profiles.get(t.assigned_to)?.full_name ?? null : null,
      })),
    };
  });

// Tickets assigned to caller (IT personnel).
export const listAssignedTickets = createServerFn({ method: "GET" })
  .middleware([requireRole(["it_personnel", "admin"])])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("assigned_to", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const profiles = await enrich(data ?? []);
    return {
      tickets: (data ?? []).map((t) => ({
        ...t,
        requester_name: t.user_id ? profiles.get(t.user_id)?.full_name ?? t.user_name : t.user_name,
      })),
    };
  });

// All tickets (admin).
export const listAllTickets = createServerFn({ method: "GET" })
  .middleware([requireRole(["admin"])])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const profiles = await enrich(data ?? []);
    return {
      tickets: (data ?? []).map((t) => ({
        ...t,
        assignee_name: t.assigned_to ? profiles.get(t.assigned_to)?.full_name ?? null : null,
      })),
    };
  });

// ----------------------------- Status updates -----------------------------

const UpdateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export const updateTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin", "it_personnel"])])
  .inputValidator((input: unknown) => UpdateStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    // IT personnel may only update their own assigned tickets.
    if (context.role === "it_personnel") {
      const { data: t } = await supabaseAdmin
        .from("tickets")
        .select("assigned_to")
        .eq("id", data.id)
        .single();
      if (t?.assigned_to !== context.userId) throw new Error("Not your ticket.");
    }
    const patch: { status: typeof data.status; resolved_at?: string } = { status: data.status };
    if (data.status === "Resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("tickets").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id, status: data.status };
  });

// Assign / reassign a ticket (admin only).
const AssignSchema = z.object({
  id: z.string().uuid(),
  assigned_to: z.string().uuid().nullable(),
});
export const assignTicket = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => AssignSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("tickets")
      .update({ assigned_to: data.assigned_to })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// User marks their own ticket as resolved by AI.
const ResolveByAiSchema = z.object({ id: z.string().uuid() });
export const markResolvedByAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResolveByAiSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("user_id")
      .eq("id", data.id)
      .single();
    if (t?.user_id !== context.userId) throw new Error("Not your ticket.");
    const { error } = await supabaseAdmin
      .from("tickets")
      .update({
        status: "Resolved",
        resolved_at: new Date().toISOString(),
        resolved_by_ai: true,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------------------------- AI Response Generator -----------------------------

const CATEGORY_GUIDANCE: Record<string, string> = {
  IT: "You represent IT Support. Reference triage and resolution windows.",
  HR: "You represent People & Culture. Be empathetic and confidential.",
  Finance: "You represent Finance. Be precise about amounts and approvals.",
  Operations: "You represent Operations. Focus on coordination and timelines.",
};
const TONE_GUIDANCE: Record<Tone, string> = {
  formal: "Professional, business-formal. No contractions. Courteous closing.",
  friendly: "Warm, conversational, reassuring. Light contractions.",
  urgent: "Direct, action-oriented. Acknowledge urgency. Short sentences.",
};

// Auto-pick a tone based on priority + category + keywords.
export function autoTone(category: string, priority: string, text: string): Tone {
  const t = text.toLowerCase();
  if (priority === "High" || /(outage|down|critical|asap|urgent|emergency)/.test(t)) return "urgent";
  if (category === "HR" || category === "Finance" || /(payroll|salary|invoice|tax)/.test(t)) return "formal";
  return "friendly";
}

function templateResponse(input: { user_name: string; title: string; category: string; tone: Tone }) {
  const team =
    input.category === "IT"
      ? "IT Support"
      : input.category === "HR"
        ? "People & Culture"
        : input.category === "Finance"
          ? "Finance"
          : "Operations";
  const opener =
    input.tone === "friendly"
      ? `Hi ${input.user_name}, thanks for reaching out!`
      : input.tone === "urgent"
        ? `Hello ${input.user_name}, we've flagged your request as urgent and are acting on it now.`
        : `Dear ${input.user_name},\n\nThank you for contacting the ${team} team.`;
  const body = `We've received your request regarding "${input.title}" and routed it to ${team}. A team member will follow up shortly.`;
  const closing =
    input.tone === "formal"
      ? `\n\nKind regards,\nThe ${team} Team`
      : input.tone === "urgent"
        ? `\n\nExpect an update within the hour.\n— ${team}`
        : `\n\nTalk soon,\nThe ${team} Team`;
  return `${opener}\n\n${body}${closing}`;
}

const GenerateResponseSchema = z.object({
  ticket_id: z.string().uuid().optional(),
  user_name: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(1).max(50),
  priority: z.string().trim().min(1).max(20),
  tone: z.enum(TONES).optional(), // if omitted, auto-pick
});

export const generateTicketResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateResponseSchema.parse(input))
  .handler(async ({ data }) => {
    const tone: Tone = data.tone ?? autoTone(data.category, data.priority, `${data.title} ${data.details}`);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { response: templateResponse({ ...data, tone }), source: "template" as const, tone };
    }
    const system = [
      "You are an AI assistant writing a reply from a support team to an employee who submitted a ticket.",
      CATEGORY_GUIDANCE[data.category] ?? `You represent the ${data.category} team.`,
      TONE_GUIDANCE[tone],
      "Keep the reply 60-140 words. Address the user by first name. Acknowledge, confirm routing, outline next steps. No markdown. Sign off as the team.",
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
      if (!res.ok) return { response: templateResponse({ ...data, tone }), source: "template" as const, tone };
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) return { response: templateResponse({ ...data, tone }), source: "template" as const, tone };
      return { response: content, source: "ai" as const, tone };
    } catch {
      return { response: templateResponse({ ...data, tone }), source: "template" as const, tone };
    }
  });
