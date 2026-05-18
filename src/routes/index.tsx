import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Sparkles, LogIn, ShieldCheck } from "lucide-react";

// Home: redirect signed-in users to their role-specific dashboard.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpsAssist — AI Internal Support Desk" },
      { name: "description", content: "AI-powered ticket classification, response, and routing." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return; // show marketing page
    const userId = data.session.user.id;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const role = roles?.[0]?.role;
    if (role === "admin") throw redirect({ to: "/admin" });
    if (role === "it_personnel") throw redirect({ to: "/it" });
    throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            search={{ admin: 1 } as never}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-primary/20"
          >
            <ShieldCheck size={16} /> Admin sign in
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium text-foreground backdrop-blur transition hover:border-primary/30"
          >
            <LogIn size={16} /> Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-10 pt-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles size={12} className="text-purple-accent" /> AI-powered support desk
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Smart ticketing,
          <br />
          <span className="bg-gradient-to-r from-soft-blue to-purple-accent bg-clip-text text-transparent">
            handled instantly.
          </span>
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          OpsAssist classifies, routes, and responds to internal support requests using AI.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/login"
            className="inline-flex h-12 items-center rounded-xl bg-[image:var(--gradient-hero)] px-6 text-base font-medium text-white shadow-[var(--shadow-glow)]"
          >
            <LogIn size={16} className="mr-2" /> Sign in
          </Link>
          <Link
            to="/login"
            search={{ admin: 1 } as never}
            className="inline-flex h-12 items-center rounded-xl border border-primary/40 bg-card px-6 text-base font-medium text-foreground transition hover:bg-primary/10"
          >
            <ShieldCheck size={16} className="mr-2" /> Admin sign in
          </Link>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">
          Default admin: <code className="rounded bg-muted px-1.5 py-0.5">Admin</code> /
          <code className="ml-1 rounded bg-muted px-1.5 py-0.5">OpsAdmin@2026</code>
        </p>
      </main>
      <Footer />
    </div>
  );
}

// Tiny re-export so unused imports don't trip the bundler.
export { Button };
