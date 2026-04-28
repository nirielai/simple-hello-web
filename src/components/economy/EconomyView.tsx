import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, BarChart3, ExternalLink, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import PyOsLayout from "@/components/layout/PyOsLayout";

const ECON_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/economy-live`;
const AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

type Rate = { code: string; name: string; buy: number | null; sell: number | null };
type Eco = { source: string; fetchedAt: string; pdfUrl: string; rates: Rate[]; usdPyg: { buy: number | null; sell: number | null; midpoint: number | null } };

const PROFILES = [
  { id: "estudiante", label: "Estudiante" },
  { id: "comerciante", label: "Comerciante" },
  { id: "productor", label: "Productor agropecuario" },
  { id: "asalariado", label: "Asalariado" },
];

const QUESTIONS = [
  "¿Conviene comprar dólares hoy?",
  "¿Qué tendencia tiene el real esta semana?",
  "¿En qué rubro me conviene invertir 10 millones de guaraníes?",
];

function fmt(n: number | null) {
  return n == null ? "—" : "₲ " + n.toLocaleString("es-PY", { maximumFractionDigits: 0 });
}
function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

export default function EconomyView() {
  const [eco, setEco] = useState<Eco | null>(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState("comerciante");
  const [question, setQuestion] = useState("");
  const [advice, setAdvice] = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const adviceRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(ECON_URL, { headers: { Authorization: AUTH } });
      const d = await r.json();
      if (!d.error) setEco(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const r = setInterval(load, 5 * 60_000);
    return () => { clearInterval(t); clearInterval(r); };
    // eslint-disable-next-line
  }, []);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || adviceLoading) return;
    setQuestion("");
    setAdvice("");
    setAdviceLoading(true);
    try {
      const r = await fetch(`${ECON_URL}?action=advisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: AUTH },
        body: JSON.stringify({ question: text, profile, rates: eco?.rates ?? [] }),
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        setAdvice(`*${j.error || "Error"}*`);
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", soFar = "", done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const js = line.slice(6).trim();
          if (js === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(js);
            const c = p.choices?.[0]?.delta?.content;
            if (c) { soFar += c; setAdvice(soFar); adviceRef.current?.scrollTo({ top: adviceRef.current.scrollHeight }); }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) { console.error(e); }
    finally { setAdviceLoading(false); }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
          <BarChart3 className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-serif text-3xl">Inteligencia económica Paraguay</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Cotizaciones del Banco Central del Paraguay extraídas en vivo del PDF oficial.
          Asesor IA con tu perfil y los datos del día.
        </p>
      </div>

      {/* Cards de tasas */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(eco?.rates.slice(0, 4) || Array(4).fill(null)).map((r, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground">{r?.code || "—"}</span>
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{r?.name || "Cargando..."}</p>
            <p className="mt-2 font-serif text-2xl">{fmt(r?.sell ?? null)}</p>
            <p className="text-xs text-muted-foreground">compra {fmt(r?.buy ?? null)}</p>
          </div>
        ))}
      </section>

      <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
        <span>
          Fuente: <strong className="text-foreground">{eco?.source || "BCP"}</strong>
          {eco && <> · actualizado {ago(eco.fetchedAt)}</>}
        </span>
        <div className="flex items-center gap-2">
          {eco?.pdfUrl && (
            <a href={eco.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
              PDF <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button onClick={load} className="inline-flex items-center gap-1 hover:text-primary">
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> refrescar
          </button>
        </div>
      </div>

      {/* Asesor */}
      <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h2 className="font-serif text-xl">Asesor económico</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Las recomendaciones usan los datos del BCP de arriba como contexto.
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfile(p.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                profile === p.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ask(); } }}
            placeholder="¿Conviene comprar dólares hoy?"
          />
          <Button onClick={() => ask()} disabled={adviceLoading || !question.trim()} size="icon">
            {adviceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              disabled={adviceLoading}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-accent disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {(adviceLoading || advice) && (
          <div ref={adviceRef} className="mt-5 max-h-96 overflow-y-auto rounded-xl bg-surface p-4">
            {adviceLoading && !advice ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> consultando datos del BCP... analizando...
              </p>
            ) : (
              <div className="prose-claude text-[15px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{advice}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
