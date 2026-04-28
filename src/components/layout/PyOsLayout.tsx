import { Link, useRouterState } from "@tanstack/react-router";
import { Bot, FileSearch, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/asistente", label: "Asistente", icon: Bot },
  { to: "/auditor", label: "Auditor", icon: FileSearch },
  { to: "/economia", label: "Economía", icon: BarChart3 },
];

export default function PyOsLayout({ children }: { children: React.ReactNode }) {
  const { location } = useRouterState();
  const path = location.pathname === "/" ? "/asistente" : location.pathname;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/asistente" className="flex items-center gap-2">
            <span className="font-serif text-lg font-medium">PY-OS</span>
            <span className="text-xs text-muted-foreground">· Inteligencia Soberana 🇵🇾</span>
          </Link>
          <nav className="flex items-center gap-1">
            {items.map((it) => {
              const Icon = it.icon;
              const active = path.startsWith(it.to);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{it.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      {children}
    </main>
  );
}
