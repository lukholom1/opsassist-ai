import { Sparkles } from "lucide-react";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const px = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl";
  const icon = size === "lg" ? 28 : size === "sm" ? 16 : 20;
  return (
    <div className="flex items-center gap-2">
      <div className="grid place-items-center rounded-xl bg-[var(--gradient-hero)] p-2 shadow-[var(--shadow-glow)]">
        <Sparkles size={icon} className="text-white" strokeWidth={2.5} />
      </div>
      <div className={`${px} font-semibold tracking-tight`}>
        <span className="text-foreground">Ops</span>
        <span className="bg-gradient-to-r from-soft-blue to-purple-accent bg-clip-text text-transparent">
          Assist
        </span>
      </div>
    </div>
  );
}
