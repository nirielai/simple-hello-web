import { Sparkles } from "lucide-react";

export function Header({
  active,
  onChange,
}: {
  active: "asistente" | "auditor" | "economia";
  onChange: (m: "asistente" | "auditor" | "economia") => void;
}) {
  const tabs: { id: typeof active; label: string }[] = [
    { id: "asistente", label: "Asistente" },
    { id: "auditor", label: "Auditor" },
    { id: "economia", label: "Economía" },
  ];

  return (
    <header className="w-full border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="serif text-lg">PY-OS</div>
            <div className="text-[11px] text-muted-foreground tracking-wide uppercase">
              Inteligencia Soberana 🇵🇾
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-1 p-1 rounded-full bg-secondary/50 border border-border/60">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`px-4 py-1.5 text-sm rounded-full transition-all ${
                active === t.id
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
