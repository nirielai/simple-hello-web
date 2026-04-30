import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, RefreshCw, TrendingUp, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import ChatShell from "@/components/chat/ChatShell";

const ECON_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/economy-live`;
const AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

const STARTERS = [
  "¿Conviene comprar dólares hoy o esperar?",
  "Predicción del real brasileño para esta semana",
  "¿En qué invierto 10 millones de guaraníes?",
  "Análisis del IPC paraguayo del último trimestre",
];

type Rate = { code: string; name: string; buy: number | null; sell: number | null };
type Eco = { source: string; warnings?: string[]; fetchedAt: string; pdfUrl: string; rates: Rate[] };

function fmt(n: number | null) {
  return n == null ? "—" : "₲ " + n.toLocaleString("es-PY", { maximumFractionDigits: 0 });
}

function RateCard({ rate }: { rate: Rate | null }) {
  if (!rate) return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 animate-pulse">
      <div className="h-3 w-12 rounded bg-muted" />
      <div className="h-5 w-20 rounded bg-muted" />
      <div className="h-2.5 w-16 rounded bg-muted" />
    </div>
  );
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rate.code}</span>
        <TrendingUp className="h-3 w-3 text-primary/60" />
      </div>
      <span className="font-serif text-base font-medium tabular-nums">{fmt(rate.sell)}</span>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Compra {fmt(rate.buy)}</span>
      </div>
    </div>
  );
}

function LiveRatesDashboard() {
  const [eco, setEco] = useState<Eco | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(ECON_URL, { headers: { Authorization: AUTH } });
      const d = await r.json();
      if (d.error) setErr(d.error); else setEco(d);
    } catch (e: any) { setErr(e?.message || "Error"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 5 * 60_000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card/40 backdrop-blur-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-sm font-medium leading-tight">Cotizaciones en vivo</h2>
            {eco?.rates?.[0] && (
              <p className="truncate text-[10px] text-muted-foreground">
                USD {fmt(eco.rates[0].sell)} · {eco.source}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {eco?.pdfUrl && (
            <a
              href={eco.pdfUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary"
            >
              BCP <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); load(); }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary"
            title="Refrescar"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          {err && (
            <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" /> {err}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(eco?.rates.slice(0, 4) || Array(4).fill(null)).map((r, i) => (
              <RateCard key={i} rate={r} />
            ))}
          </div>

          {eco && eco.rates.length > 4 && (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {eco.rates.slice(4).map((r) => (
                <div key={r.code} className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-2 py-1.5">
                  <span className="text-[10px] font-semibold uppercase">{r.code}</span>
                  <span className="text-[11px] tabular-nums">{fmt(r.sell)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EconomyView() {
  return (
    <ChatShell
      module="economia"
      team="economia"
      title="Inteligencia económica"
      subtitle="Cotizaciones BCP en vivo + equipo de 20+ agentes especializados con datos 2026, redes sociales y pensamiento crítico."
      starters={STARTERS}
      emptyIcon={<BarChart3 className="h-6 w-6 text-primary" />}
      topBar={<LiveRatesDashboard />}
    />
  );
}
