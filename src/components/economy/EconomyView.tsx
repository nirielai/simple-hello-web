import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, RefreshCw, TrendingUp, AlertTriangle } from "lucide-react";
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
    <div className="mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-sm font-medium">Cotizaciones en vivo</h2>
          {eco && (
            <p className="text-[10px] text-muted-foreground">{eco.source}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {eco?.pdfUrl && (
            <a href={eco.pdfUrl} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5">
              BCP <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          <button onClick={load} className="text-muted-foreground hover:text-primary" title="Refrescar">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

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
  );
}

export default function EconomyView() {
  return (
    <ChatShell
      module="economia"
      team="economia"
      title="Inteligencia económica"
      subtitle="Cotizaciones BCP en vivo + equipo de 15 agentes especializados que investigan, analizan y predicen con pensamiento crítico."
      starters={STARTERS}
      emptyIcon={<BarChart3 className="h-6 w-6 text-primary" />}
      topBar={<LiveRatesDashboard />}
    />
  );
}
