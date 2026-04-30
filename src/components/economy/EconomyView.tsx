import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, BarChart3, Brain, ExternalLink, Loader2, RefreshCw, Sparkles, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import PyOsLayout from "@/components/layout/PyOsLayout";

const ECON_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/economy-live`;
const AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

type Rate = { code: string; name: string; buy: number | null; sell: number | null };
type Eco = {
  source: string; sources?: string[]; warnings?: string[];
  fetchedAt: string; pdfUrl: string; rates: Rate[];
  usdPyg: { buy: number | null; sell: number | null; midpoint: number | null };
};

const PROFILES = [
  { id: "estudiante", label: "Estudiante" },
  { id: "comerciante", label: "Comerciante" },
  { id: "productor", label: "Productor agropecuario" },
  { id: "asalariado", label: "Asalariado" },
];

const QUESTIONS = [
  "¿Conviene comprar dólares hoy?",
  "Predicción del real esta semana",
  "¿En qué invierto 10 millones de guaraníes?",
];

// ---------- Memoria de aprendizaje (localStorage) ----------
const MEM_KEY = "pyos.economy.memory";
const HIST_KEY = "pyos.economy.history";

function loadMem(): string[] {
  try { return JSON.parse(localStorage.getItem(MEM_KEY) || "[]"); } catch { return []; }
}
function addMem(fact: string) {
  const list = loadMem();
  if (list.includes(fact)) return;
  list.unshift(fact);
  localStorage.setItem(MEM_KEY, JSON.stringify(list.slice(0, 25)));
}
function clearMem() { localStorage.removeItem(MEM_KEY); }

type HistPoint = { at: number; mid: number; code: string };
function loadHist(): HistPoint[] {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch { return []; }
}
function pushHist(rates: Rate[]) {
  const now = Date.now();
  const list = loadHist();
  for (const r of rates) {
    if (r.buy && r.sell) {
      list.push({ at: now, mid: Math.round((r.buy + r.sell) / 2), code: r.code });
    }
  }
  // Mantener últimos 200 puntos
  localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(-200)));
}

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
  const [err, setErr] = useState<string | null>(null);
  const [profile, setProfile] = useState(() => localStorage.getItem("pyos.economy.profile") || "comerciante");
  const [question, setQuestion] = useState("");
  const [advice, setAdvice] = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [predicting, setPredicting] = useState<string | null>(null);
  const [prediction, setPrediction] = useState("");
  const [memOpen, setMemOpen] = useState(false);
  const adviceRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem("pyos.economy.profile", profile); addMem(`Perfil: ${profile}`); }, [profile]);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(ECON_URL, { headers: { Authorization: AUTH } });
      const d = await r.json();
      if (d.error) { setErr(d.error); return; }
      setEco(d);
      pushHist(d.rates || []);
    } catch (e: any) { setErr(e?.message || "Error de red"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => setEco((e) => e ? { ...e } : e), 30_000); // re-render para "ago"
    const r = setInterval(load, 5 * 60_000);
    return () => { clearInterval(t); clearInterval(r); };
    // eslint-disable-next-line
  }, []);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || adviceLoading) return;
    addMem(`Preguntó: ${text.slice(0, 80)}`);
    setQuestion("");
    setAdvice("");
    setPrediction("");
    setAdviceLoading(true);
    try {
      const memory = loadMem().slice(0, 15).map((f, i) => `${i + 1}. ${f}`).join("\n");
      const r = await fetch(`${ECON_URL}?action=advisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: AUTH },
        body: JSON.stringify({ question: text, profile, rates: eco?.rates ?? [], memory }),
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        setAdvice(`*${j.error || "Error"}*`);
        return;
      }
      await readSSE(r.body, (c) => {
        setAdvice((s) => s + c);
        adviceRef.current?.scrollTo({ top: adviceRef.current.scrollHeight });
      });
    } catch (e) { console.error(e); }
    finally { setAdviceLoading(false); }
  };

  const predict = async (code: string) => {
    if (predicting) return;
    setPredicting(code); setPrediction(""); setAdvice("");
    try {
      const all = loadHist().filter((h) => h.code === code).slice(-20);
      if (all.length < 3) {
        setPrediction(`*Necesito más datos históricos de ${code}. Refresca la página unas veces más para acumular puntos.*`);
        return;
      }
      const r = await fetch(`${ECON_URL}?action=predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: AUTH },
        body: JSON.stringify({ code, history: all }),
      });
      if (!r.ok || !r.body) { setPrediction("*Error generando predicción*"); return; }
      await readSSE(r.body, (c) => setPrediction((s) => s + c));
    } finally { setPredicting(null); }
  };

  return (
    <PyOsLayout>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl">Inteligencia económica Paraguay</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Cotización en vivo del BCP + casas de cambio + asesor IA con pensamiento crítico que aprende con cada conversación.
          </p>
        </div>

        {err && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {err}
          </div>
        )}

        {/* Cards de tasas */}
        <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {(eco?.rates.slice(0, 4) || Array(4).fill(null)).map((r, i) => (
            <div key={i} className="group rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{r?.code || "—"}</span>
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{r?.name || (loading ? "Cargando..." : "Sin datos")}</p>
              <p className="mt-2 font-serif text-xl sm:text-2xl">{fmt(r?.sell ?? null)}</p>
              <p className="text-xs text-muted-foreground">compra {fmt(r?.buy ?? null)}</p>
              {r?.code && (
                <button
                  onClick={() => predict(r.code)}
                  disabled={!!predicting}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary opacity-60 transition hover:opacity-100 disabled:opacity-30"
                >
                  {predicting === r.code ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  predecir 7d
                </button>
              )}
            </div>
          ))}
        </section>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
          <span className="min-w-0">
            Fuente: <strong className="text-foreground">{eco?.source || "—"}</strong>
            {eco && <> · actualizado {ago(eco.fetchedAt)}</>}
          </span>
          <div className="flex items-center gap-2">
            {eco?.pdfUrl && (
              <a href={eco.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                BCP <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button onClick={load} className="inline-flex items-center gap-1 hover:text-primary">
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> refrescar
            </button>
          </div>
        </div>

        {eco?.warnings && eco.warnings.length > 0 && (
          <div className="mt-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-900">
            ⚠️ {eco.warnings.join(" · ")}
          </div>
        )}

        {/* Predicción */}
        {prediction && (
          <section className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-soft">
            <h3 className="mb-2 flex items-center gap-2 font-serif text-lg"><Sparkles className="h-4 w-4 text-primary" /> Proyección 7 días</h3>
            <div className="prose-claude text-[14px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{prediction}</ReactMarkdown>
            </div>
          </section>
        )}

        {/* Asesor */}
        <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-serif text-xl">Asesor económico</h2>
              <p className="mt-1 text-sm text-muted-foreground">Razona con los datos de arriba, tu perfil y lo que aprendió de vos.</p>
            </div>
            <button
              onClick={() => setMemOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              title="Memoria de aprendizaje"
            >
              <Brain className="h-3 w-3" /> {loadMem().length}
            </button>
          </div>

          {memOpen && (
            <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">Memoria ({loadMem().length})</span>
                <button onClick={() => { clearMem(); setMemOpen(false); }} className="text-destructive hover:underline">Borrar todo</button>
              </div>
              {loadMem().length === 0 ? (
                <p className="text-muted-foreground">Aún no hay aprendizajes. Cada conversación irá nutriendo al asesor.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {loadMem().slice(0, 10).map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
            </div>
          )}

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
                  <Loader2 className="h-4 w-4 animate-spin" /> Analizando datos del BCP, contexto y tu memoria…
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
    </PyOsLayout>
  );
}

// ---- SSE helper compartido ----
async function readSSE(body: ReadableStream<Uint8Array>, onDelta: (c: string) => void) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const js = line.slice(6).trim();
      if (js === "[DONE]") return;
      try {
        const p = JSON.parse(js);
        const c = p.choices?.[0]?.delta?.content;
        if (c) onDelta(c);
      } catch { buf = line + "\n" + buf; break; }
    }
  }
}
