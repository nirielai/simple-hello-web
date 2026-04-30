import { useState } from "react";
import { Menu, MessageSquarePlus, Trash2, Bot, FileSearch, BarChart3, X } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Conversation } from "@/lib/chat-storage";

const items = [
  { to: "/asistente", label: "Asistente", icon: Bot },
  { to: "/auditor", label: "Auditor", icon: FileSearch },
  { to: "/economia", label: "Economía", icon: BarChart3 },
];

interface Props {
  conversations?: Conversation[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onNew?: () => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
  showHistory?: boolean;
}

export default function PyOsLayout({
  children, conversations = [], activeId, onSelect, onNew, onDelete, onClearAll, showHistory = false,
}: { children: React.ReactNode } & Props) {
  const { location } = useRouterState();
  const path = location.pathname === "/" ? "/asistente" : location.pathname;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      {open && (
        <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-surface transition-transform md:relative md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link to="/asistente" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <span className="font-serif text-lg font-medium">PY-OS</span>
            <span className="text-xs text-muted-foreground">🇵🇾</span>
          </Link>
          <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent md:hidden" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="px-2 py-3">
          {items.map((it) => {
            const Icon = it.icon;
            const active = path.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "bg-accent text-accent-foreground" : "text-foreground/70 hover:bg-accent/60",
                )}
              >
                <Icon className="h-4 w-4" /> {it.label}
              </Link>
            );
          })}
        </nav>

        {showHistory && (
          <>
            <div className="px-3 pb-2 pt-2">
              <Button onClick={() => { onNew?.(); setOpen(false); }} variant="outline" className="w-full justify-start gap-2">
                <MessageSquarePlus className="h-4 w-4" /> Nueva conversación
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Historial</p>
              {conversations.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">Aún no hay conversaciones.</p>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition",
                      activeId === c.id ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <button
                      onClick={() => { onSelect?.(c.id); setOpen(false); }}
                      className="flex-1 truncate text-left"
                      title={c.title}
                    >
                      {c.title}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete?.(c.id); }}
                      className="opacity-0 transition group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/85 px-3 backdrop-blur md:px-6">
          <button
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent md:hidden"
            aria-label="Menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <span className="font-serif text-base font-medium">PY-OS</span>
          </div>
          {showHistory && (
            <button
              onClick={() => onNew?.()}
              className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-accent md:hidden"
              aria-label="Nueva conversación"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          )}
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
