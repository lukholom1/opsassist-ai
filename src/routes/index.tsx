import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { submitTicket } from "@/lib/tickets.functions";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ShieldCheck, Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpsAssist — AI Ticket Classification by BYTEBUILDERS" },
      {
        name: "description",
        content:
          "Submit a support ticket and let AI route it to the right team with the right priority.",
      },
    ],
  }),
  component: SubmitPage,
});

type Result = { id: string; category: string; priority: string } | null;

function SubmitPage() {
  // useServerFn re-export from react-router doesn't exist; use the start hook
  const submit = useServerFn(submitTicket);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await submit({ data: { user_name: name, title, details } });
      setResult(res);
      setName("");
      setTitle("");
      setDetails("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Logo />
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur transition hover:border-primary/30 hover:text-foreground"
        >
          <ShieldCheck size={16} />
          Admin
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-10 pt-6">
        <div className="mb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles size={12} className="text-purple-accent" /> AI-powered routing
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Submit a request,
            <br />
            <span className="bg-gradient-to-r from-soft-blue to-purple-accent bg-clip-text text-transparent">
              we'll route it instantly.
            </span>
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Our AI classifies your ticket by department and urgency the moment you submit.
          </p>
        </div>

        {result ? (
          <SuccessCard result={result} onNew={() => setResult(null)} />
        ) : (
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8"
          >
            <div className="grid gap-5">
              <Field label="Full name">
                <Input
                  required
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </Field>
              <Field label="Ticket title">
                <Input
                  required
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Cannot access company VPN"
                />
              </Field>
              <Field label="Describe the issue">
                <Textarea
                  required
                  value={details}
                  maxLength={2000}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Provide as much context as possible — urgency, what you tried, etc."
                  className="min-h-[140px] resize-none"
                />
              </Field>

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-12 rounded-xl bg-[var(--gradient-hero)] text-base font-medium text-white shadow-[var(--shadow-glow)] transition hover:opacity-95 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Classifying...
                  </>
                ) : (
                  "Submit ticket"
                )}
              </Button>
            </div>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SuccessCard({
  result,
  onNew,
}: {
  result: { id: string; category: string; priority: string };
  onNew: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-soft)] animate-in fade-in zoom-in-95 duration-300">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success">
        <CheckCircle2 size={32} />
      </div>
      <h2 className="mt-4 text-2xl font-semibold">Ticket submitted successfully</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Our AI has routed your request to the right team.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Stat label="Category" value={result.category} tone="blue" />
        <Stat label="Priority" value={result.priority} tone={priorityTone(result.priority)} />
      </div>

      <Button
        onClick={onNew}
        variant="outline"
        className="mt-6 h-11 rounded-xl border-border bg-background"
      >
        Submit another
      </Button>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "purple" | "green" | "amber" | "red";
}) {
  const tones: Record<string, string> = {
    blue: "from-soft-blue/15 to-soft-blue/5 text-soft-blue ring-soft-blue/20",
    purple: "from-purple-accent/15 to-purple-accent/5 text-purple-accent ring-purple-accent/20",
    green: "from-success/15 to-success/5 text-success ring-success/20",
    amber: "from-warning/15 to-warning/5 text-warning ring-warning/20",
    red: "from-destructive/15 to-destructive/5 text-destructive ring-destructive/20",
  };
  return (
    <div
      className={`rounded-xl bg-gradient-to-br p-4 ring-1 ring-inset ${tones[tone]}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function priorityTone(p: string): "red" | "amber" | "green" {
  if (p === "High") return "red";
  if (p === "Medium") return "amber";
  return "green";
}
