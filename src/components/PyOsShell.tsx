import { useEffect, useRef, useState, useTransition } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowUp,
  BarChart3,
  Bot,
  CheckCircle2,
  FileSearch,
  Globe2,
  Loader2,
  Menu,
  Mic,
  Newspaper,
  Paperclip,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Upload,
  Volume2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getEconomyData, type EconomyData } from "@/server/economy.functions";

export type Mode = "assistant" | "auditor" | "economy";

const modes: Array<{ id: Mode; label: string; icon: typeof Bot; hint: string; to: string }> = [
  { id: "assistant", label: "Asistente", icon: Bot, hint: "Trámites, salud, MEC, IPS, SET y vida diaria", to: "/asistente" },
  { id: "auditor", label: "Auditor", icon: FileSearch, hint: "PDFs, contratos, licitaciones y URLs públicas", to: "/auditor" },
  { id: "economy", label: "Economía", icon: BarChart3, hint: "Canasta, dólar, inflación, rubros y mercado", to: "/economia" },
];

const starterPrompts: Record<Mode, string[]> = {
  assistant: ["Formalizar empresa", "Consultar IPS", "Trámite de cédula", "Calcular IRP"],
  auditor: ["Pegá la URL de un PDF público", "Subí una licitación", "Analizar adenda", "Detectar adjudicación directa"],
  economy: ["¿Conviene comprar dólares?", "Variación del USD esta semana", "Cotización del Real", "Inflación estimada"],
};

type AuditResult = {
  filename: string;
  pages: number;
  chars: number;
  amounts: string[];
  dates: string[];
  parties: string[];
  risk: "Verde" | "Amarillo" | "Rojo";
  reasons: string[];
  excerpt: string;
  error?: string;
};

function fmtGs(n: number | null) {
  if (n == null) return "—";
  return "₲ " + n.toLocaleString("es-PY", { maximumFractionDigits: 0 });
}
function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("es-PY", { maximumFractionDigits: 2 });
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h} h`;
}

export default function PyOsShell({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMode = modes.find((m) => m.id === mode) ?? modes[0];
  const ActiveIcon = activeMode.icon;

  // Economy live data
  const [economy, setEconomy] = useState<EconomyData | null>(null);
  const [loadingEcon, setLoadingEcon] = useState(false);
  const [now, setNow] = useState(Date.now());

  const loadEconomy = async () => {
    setLoadingEcon(true);
    try {
      const data = await getEconomyData();
      setEconomy(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEcon(false);
    }
  };

  useEffect(() => {
    loadEconomy();
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(loadEconomy, 5 * 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audit
  const [auditing, startAuditing] = useTransition();
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    setFiles((current) => [...current, ...selected]);
    event.target.value = "";
  };

  const runAudit = () => {
    if (mode !== "auditor") return;
    const url = message.trim();
    const file = files[0];
    if (!url && !file) return;
    setAuditResult(null);
    startAuditing(async () => {
      try {
        let res: Response;
        if (file) {
          const fd = new FormData();
          fd.append("file", file);
          res = await fetch("/api/audit-pdf", { method: "POST", body: fd });
        } else {
          res = await fetch("/api/audit-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
        }
        const data = (await res.json()) as AuditResult;
        setAuditResult(data);
      } catch (e) {
        setAuditResult({
          filename: "error", pages: 0, chars: 0, amounts: [], dates: [], parties: [],
          risk: "Verde", reasons: [],
          excerpt: "", error: e instanceof Error ? e.message : "Error",
        });
      }
    });
  };

  const onSend = () => {
    if (mode === "auditor") {
      runAudit();
    } else if (mode === "economy") {
      loadEconomy();
    }
  };

  const goToMode = (next: Mode) => navigate({ to: modes.find((m) => m.id === next)!.to });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menú">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="border-border bg-card">
                <SheetHeader>
                  <SheetTitle className="font-serif text-2xl">PY-OS 🇵🇾</SheetTitle>
                  <SheetDescription>
                    Inteligencia soberana para ciudadanía, auditoría pública y mercado.
                  </SheetDescription>
                </SheetHeader>
                <nav className="mt-8 grid gap-2">
                  {modes.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => goToMode(item.id)}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border border-transparent p-3 text-left transition hover:bg-accent",
                          mode === item.id && "border-border bg-surface shadow-soft",
                        )}
                      >
                        <Icon className="mt-0.5 h-5 w-5 text-primary" />
                        <span>
                          <span className="block text-sm font-semibold">{item.label}</span>
                          <span className="text-xs text-muted-foreground">{item.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </nav>
                <div className="mt-8 rounded-lg border border-border bg-surface/70 p-4 text-sm text-muted-foreground">
                  Datos económicos en vivo desde el <span className="font-medium text-foreground">Banco Central del Paraguay</span>. Auditor con scraping y parseo real de PDFs.
                </div>
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-sm font-semibold tracking-normal">PY-OS · Inteligencia Soberana 🇵🇾</p>
              <p className="text-xs text-muted-foreground">Español · Guaraní · Jopara</p>
            </div>
          </div>
          <Badge variant="outline" className="hidden border-primary/30 bg-accent text-accent-foreground sm:inline-flex">
            {economy?.usdPyg.midpoint
              ? `USD ≈ ${fmtGs(economy.usdPyg.midpoint)} · BCP`
              : "MVP Paraguay"}
          </Badge>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden rounded-xl border border-border bg-card p-4 shadow-soft lg:block">
          <p className="mb-4 text-xs font-semibold uppercase text-muted-foreground">Secciones</p>
          <div className="grid gap-2">
            {modes.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition",
                    mode === item.id
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-background hover:bg-surface",
                  )}
                >
                  <Icon className="mt-0.5 h-5 w-5 text-primary" />
                  <span>
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.hint}</span>
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="mt-6 rounded-lg border border-border bg-surface/70 p-4 text-xs text-muted-foreground">
            Cotizaciones del BCP se actualizan automáticamente cada 5 minutos. Auditor lee PDFs reales.
          </div>
        </aside>

        <div className="flex min-h-[calc(100vh-7rem)] flex-col rounded-xl border border-border bg-card shadow-soft">
          <div className="border-b border-border p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              {modes.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => goToMode(item.id)}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
                      mode === item.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-accent",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-between p-4 sm:p-8">
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col py-4">
              <div className="mb-6 text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
                  <ActiveIcon className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-3xl font-medium leading-tight sm:text-5xl">
                  {mode === "assistant" && "Asistente ciudadano"}
                  {mode === "auditor" && "Auditor público en vivo"}
                  {mode === "economy" && "Inteligencia económica Paraguay"}
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {mode === "assistant" && "Chat propio para consultas en español, guaraní o jopara, con archivos adjuntos, búsqueda web y voz preparada."}
                  {mode === "auditor" && "Pegá la URL de un PDF público o subí un archivo. Extraemos montos, fechas, partes y detectamos señales de riesgo en tiempo real."}
                  {mode === "economy" && "Cotizaciones referenciales del Banco Central del Paraguay (PDF oficial), refrescadas automáticamente."}
                </p>
              </div>

              {/* Mode-specific live panel */}
              {mode === "economy" && <EconomyPanel data={economy} loading={loadingEcon} now={now} onRefresh={loadEconomy} />}
              {mode === "auditor" && <AuditorPanel result={auditResult} loading={auditing} />}
              {mode === "assistant" && (
                <div className="flex flex-wrap justify-center gap-2">
                  {starterPrompts.assistant.map((p) => (
                    <button key={p} onClick={() => setMessage(p)} className="rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-accent hover:text-accent-foreground">
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mx-auto w-full max-w-3xl">
              {files.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {files.map((file, i) => (
                    <span key={i} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs">
                      <Paperclip className="h-3.5 w-3.5 text-primary" />
                      {file.name}
                      <button onClick={() => setFiles((c) => c.filter((_, idx) => idx !== i))} aria-label={`Quitar ${file.name}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-border bg-background p-2 shadow-soft">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder={
                    mode === "auditor"
                      ? "Pegá la URL de un PDF público (ej: https://...licitacion.pdf) o subí un archivo"
                      : mode === "economy"
                        ? "Consultá el dólar, real, inflación... (Enter para refrescar datos del BCP)"
                        : "Escribí tu consulta en español, guaraní o jopara..."
                  }
                  className="min-h-[92px] resize-none border-0 bg-transparent px-3 py-3 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2">
                  <div className="flex items-center gap-1">
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf" />
                    <Button variant="ghost" size="icon" aria-label="Adjuntar PDF" onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Usar micrófono" disabled>
                      <Mic className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Buscar en la web pública" disabled>
                      <Globe2 className="h-5 w-5" />
                    </Button>
                  </div>
                  <Button size="icon" aria-label="Enviar" onClick={onSend} disabled={auditing || loadingEcon}>
                    {auditing || loadingEcon ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> escucha</span>
                <span className="inline-flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" /> habla</span>
                <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> {mode === "auditor" ? "scraping real de PDF" : mode === "economy" ? `BCP en vivo · ${economy ? timeAgo(economy.fetchedAt) : "..."}` : "markdown + streaming"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-medium">Alcance de consulta</h2>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-risk-low" /> Webs del gobierno bajo demanda por URL.</p>
              <p className="flex gap-2"><Newspaper className="mt-0.5 h-4 w-4 text-primary" /> Fuentes públicas (BCP, Contrataciones).</p>
              <p className="flex gap-2"><Upload className="mt-0.5 h-4 w-4 text-primary" /> PDFs leídos íntegramente en el servidor.</p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-medium">Cómo audita</h2>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>1. Descarga el PDF (URL o subido).</p>
              <p>2. Extrae texto con <code className="rounded bg-surface px-1">unpdf</code> en el edge.</p>
              <p>3. Detecta montos (₲ / USD), fechas, partes y señales de riesgo (adjudicación directa, urgencia, único oferente, adendas).</p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-medium">Mercado en vivo · BCP</h2>
              </div>
              <button onClick={loadEconomy} aria-label="Refrescar" className="text-muted-foreground hover:text-foreground">
                <RefreshCw className={cn("h-4 w-4", loadingEcon && "animate-spin")} />
              </button>
            </div>
            <div className="grid gap-3">
              {(economy?.rates ?? []).slice(0, 4).map((r) => (
                <div key={r.code} className="flex items-start justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-muted-foreground">{r.name} <span className="text-xs">({r.code})</span></span>
                  <span className="text-right text-sm font-semibold">
                    {fmtGs(r.sell)}
                    <span className="block text-xs font-normal text-muted-foreground">compra {fmtNum(r.buy)} · venta {fmtNum(r.sell)}</span>
                  </span>
                </div>
              ))}
              {(!economy || economy.rates.length === 0) && (
                <p className="text-xs text-muted-foreground">{loadingEcon ? "Descargando PDF del BCP..." : "Sin datos. Tocá refrescar."}</p>
              )}
              {economy?.fetchedAt && (
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Actualizado {timeAgo(economy.fetchedAt)} · {new Date(economy.fetchedAt).toLocaleTimeString("es-PY")}</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function EconomyPanel({ data, loading, now, onRefresh }: { data: EconomyData | null; loading: boolean; now: number; onRefresh: () => void }) {
  void now;
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Cotización oficial</p>
          <p className="font-serif text-3xl">USD / PYG · {data?.usdPyg.midpoint ? fmtGs(data.usdPyg.midpoint) : "—"}</p>
          {data?.usdPyg.buy && data?.usdPyg.sell && (
            <p className="text-sm text-muted-foreground">Compra {fmtNum(data.usdPyg.buy)} · Venta {fmtNum(data.usdPyg.sell)}</p>
          )}
        </div>
        <button onClick={onRefresh} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refrescar
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(data?.rates ?? []).map((r) => (
          <div key={r.code} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
            <div>
              <p className="text-sm font-medium">{r.code}</p>
              <p className="text-xs text-muted-foreground">{r.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{fmtNum(r.sell)}</p>
              <p className="text-[10px] text-muted-foreground">compra {fmtNum(r.buy)}</p>
            </div>
          </div>
        ))}
        {(!data || data.rates.length === 0) && (
          <p className="text-xs text-muted-foreground sm:col-span-2">{loading ? "Descargando PDF del BCP..." : data?.error ?? "Sin datos. Refrescá."}</p>
        )}
      </div>
      {data?.pdfUrl && (
        <p className="mt-4 text-[11px] text-muted-foreground">
          Fuente: <a href={data.pdfUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">PDF oficial del BCP</a>
        </p>
      )}
    </div>
  );
}

function AuditorPanel({ result, loading }: { result: AuditResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface/60 p-6 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
        Descargando y leyendo el PDF...
      </div>
    );
  }
  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/30 p-6 text-center text-sm text-muted-foreground">
        Pegá una URL de PDF o subí un archivo, después tocá enviar (o ⌘/Ctrl+Enter).
      </div>
    );
  }
  if (result.error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
        Error: {result.error}
      </div>
    );
  }
  const riskColor =
    result.risk === "Rojo" ? "text-risk-high" : result.risk === "Amarillo" ? "text-risk-medium" : "text-risk-low";
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-border bg-surface/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Documento auditado</p>
            <p className="font-serif text-xl">{result.filename}</p>
            <p className="text-xs text-muted-foreground">{result.pages} págs · {result.chars.toLocaleString("es-PY")} caracteres</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Riesgo</p>
            <p className={cn("font-serif text-2xl font-semibold", riskColor)}>{result.risk}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Block title="Montos detectados" items={result.amounts} empty="No se detectaron montos." />
        <Block title="Fechas" items={result.dates} empty="No se detectaron fechas." />
        <Block title="Partes / Organismos" items={result.parties} empty="No se detectaron partes." />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Señales</p>
        <ul className="grid gap-1 text-sm">
          {result.reasons.map((r) => (
            <li key={r} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-primary shrink-0" />{r}</li>
          ))}
        </ul>
      </div>
      {result.excerpt && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Extracto del texto</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{result.excerpt}</pre>
        </div>
      )}
    </div>
  );
}

function Block({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {items.map((it) => <li key={it} className="rounded bg-surface px-2 py-1 font-mono text-xs">{it}</li>)}
        </ul>
      )}
    </div>
  );
}