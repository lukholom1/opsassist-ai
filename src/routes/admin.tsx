import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listTickets, updateTicketStatus, generateTicketResponse } from "@/lib/tickets.functions";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock, LogOut, Search, Inbox, Loader2, Sparkles, Copy, Check, RefreshCw } from "lucide-react";

// Default admin password — also documented in README.md
const ADMIN_PASSWORD = "OpsAdmin@2026";
const STORAGE_KEY = "opsassist_admin_authed";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Dashboard — OpsAssist" }] }),
  component: AdminPage,
});

type TicketStatus = "Open" | "In Progress" | "Resolved";
type Ticket = {
  id: string;
  user_name: string;
  title: string;
  details: string;
  category: string;
  priority: string;
  status: TicketStatus;
  created_at: string;
};

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(STORAGE_KEY) === "1") {
      setAuthed(true);
    }
  }, []);
  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      onSuccess();
    } else {
      setError("Incorrect password.");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <form
          onSubmit={submit}
          className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-soft)]"
        >
          <div className="mb-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-foreground">
              <Lock size={20} />
            </div>
            <h1 className="mt-4 text-xl font-semibold">Admin sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the admin password to view the dashboard.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
            />
          </div>
          {error && (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="mt-5 h-11 w-full rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
          >
            Sign in
          </Button>
          <Link
            to="/"
            className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to ticket form
          </Link>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Built by <span className="font-semibold text-foreground">BYTEBUILDERS</span>
        </p>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const fetchTickets = useServerFn(listTickets);
  const updateStatus = useServerFn(updateTicketStatus);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTickets()
      .then((r) => setTickets(r.tickets as Ticket[]))
      .finally(() => setLoading(false));
  }, [fetchTickets]);

  // Optimistically update a ticket's status, then sync to the server.
  async function changeStatus(id: string, next: TicketStatus) {
    const prev = tickets;
    setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, status: next } : t)));
    setSavingId(id);
    try {
      await updateStatus({ data: { id, status: next } });
    } catch (e) {
      console.error(e);
      setTickets(prev); // rollback on failure
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (status !== "all" && t.status !== status) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !t.title.toLowerCase().includes(q) &&
          !t.user_name.toLowerCase().includes(q) &&
          !t.details.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [tickets, category, priority, status, query]);

  const stats = useMemo(() => {
    const total = tickets.length;
    const high = tickets.filter((t) => t.priority === "High").length;
    const inProgress = tickets.filter((t) => t.status === "In Progress").length;
    const resolved = tickets.filter((t) => t.status === "Resolved").length;
    return { total, high, inProgress, resolved };
  }, [tickets]);

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY);
    onLogout();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Submit form
            </Link>
            <Button variant="outline" size="sm" onClick={logout} className="rounded-lg">
              <LogOut size={14} className="mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tickets dashboard</h1>
            <p className="text-sm text-muted-foreground">
              All incoming requests, classified by AI in real time.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total tickets" value={stats.total} accent="navy" />
          <StatCard label="High priority" value={stats.high} accent="red" />
          <StatCard label="In progress" value={stats.inProgress} accent="purple" />
          <StatCard label="Resolved" value={stats.resolved} accent="blue" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, user, details..."
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="HR">HR</SelectItem>
              <SelectItem value="IT">IT</SelectItem>
              <SelectItem value="Finance">Finance</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading tickets...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Inbox size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No tickets match your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Ticket</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border/60 last:border-0 transition hover:bg-muted/30"
                    >
                      <td className="px-4 py-4 font-medium text-foreground">{t.user_name}</td>
                      <td className="max-w-md px-4 py-4">
                        <div className="font-medium text-foreground">{t.title}</div>
                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {t.details}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <CategoryPill value={t.category} />
                      </td>
                      <td className="px-4 py-4">
                        <PriorityPill value={t.priority} />
                      </td>
                      <td className="px-4 py-4">
                        <StatusSelector
                          value={t.status}
                          saving={savingId === t.id}
                          onChange={(next) => changeStatus(t.id, next)}
                        />
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "navy" | "blue" | "purple" | "red";
}) {
  const colors: Record<string, string> = {
    navy: "from-navy/10 to-navy/0 text-navy",
    blue: "from-soft-blue/15 to-soft-blue/0 text-soft-blue",
    purple: "from-purple-accent/15 to-purple-accent/0 text-purple-accent",
    red: "from-destructive/15 to-destructive/0 text-destructive",
  };
  return (
    <div
      className={`rounded-2xl border border-border bg-gradient-to-br p-5 shadow-[var(--shadow-soft)] ${colors[accent]}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CategoryPill({ value }: { value: string }) {
  const map: Record<string, string> = {
    IT: "bg-soft-blue/10 text-soft-blue ring-soft-blue/20",
    HR: "bg-purple-accent/10 text-purple-accent ring-purple-accent/20",
    Finance: "bg-success/10 text-success ring-success/20",
    Operations: "bg-warning/10 text-warning ring-warning/20",
  };
  const cls = map[value] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {value}
    </span>
  );
}

function PriorityPill({ value }: { value: string }) {
  const map: Record<string, string> = {
    High: "bg-destructive/10 text-destructive ring-destructive/20",
    Medium: "bg-warning/10 text-warning ring-warning/20",
    Low: "bg-success/10 text-success ring-success/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${map[value] ?? ""}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  );
}

// Inline status selector for the admin table — color-coded with optimistic save indicator.
function StatusSelector({
  value,
  saving,
  onChange,
}: {
  value: TicketStatus;
  saving: boolean;
  onChange: (next: TicketStatus) => void;
}) {
  const styles: Record<TicketStatus, string> = {
    Open: "bg-warning/10 text-warning ring-warning/20",
    "In Progress": "bg-soft-blue/10 text-soft-blue ring-soft-blue/20",
    Resolved: "bg-success/10 text-success ring-success/20",
  };
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v) => onChange(v as TicketStatus)}>
        <SelectTrigger
          className={`h-8 w-[140px] rounded-full border-0 px-3 text-xs font-medium ring-1 ring-inset ${styles[value]}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Open">Open</SelectItem>
          <SelectItem value="In Progress">In Progress</SelectItem>
          <SelectItem value="Resolved">Resolved</SelectItem>
        </SelectContent>
      </Select>
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
