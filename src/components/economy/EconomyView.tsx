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
function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function LiveRatesBar() {
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
    const t = setInterval(() => setEco((e) => e ? { ...e } : e), 30_000);
    return () => { clearInterval(i); clearInterval(t); };
  }, []);

  return (
    <div className="-mx-3 mb-2 border-b border-border bg-surface/50 px-3 py-2 sm:-mx-6 sm:px-6">
      {err && (
        <div className="mb-1.5 flex items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3" /> {err}
        </div>
      )}
      <div className="flex items-center gap-2 overflow-x-auto">
        {(eco?.rates.slice(0, 4) || Array(4).fill(null)).map((r, i) => (
          <div key={i} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1">
            <TrendingUp className="h-3 w-3 text-primary" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="text-[10px] font-bold uppercase">{r?.code || "—"}</span>
                <span className="font-serif text-xs">{fmt(r?.sell ?? null)}</span>
              </div>
              <p className="text-[9px] text-muted-foreground">venta · compra {fmt(r?.buy ?? null)}</p>
            </div>
          </div>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
          {eco && <span className="hidden sm:inline">{eco.source} · {ago(eco.fetchedAt)}</span>}
          {eco?.pdfUrl && (
            <a href={eco.pdfUrl} target="_blank" rel="noreferrer" className="hover:text-primary">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button onClick={load} className="hover:text-primary" title="Refrescar">
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EconomyView() {
  return (
    <ChatShell
      module="economia"
      team="economia"
      title="Inteligencia económica"
      subtitle="Cotizaciones BCP en vivo + equipo de sub-agentes (DataBot, Analista, Asesor) que investigan, analizan y predicen con pensamiento crítico."
      starters={STARTERS}
      emptyIcon={<BarChart3 className="h-6 w-6 text-primary" />}
      topBar={<LiveRatesBar />}
    />
  );
}
