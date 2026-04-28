import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUp,
  BarChart3,
  Bot,
  CheckCircle2,
  FileSearch,
  Globe2,
  Menu,
  Mic,
  Newspaper,
  Paperclip,
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

type Mode = "assistant" | "auditor" | "economy";

const modes: Array<{ id: Mode; label: string; icon: typeof Bot; hint: string }> = [
  { id: "assistant", label: "Asistente", icon: Bot, hint: "Trámites, salud, MEC, IPS, SET y vida diaria" },
  { id: "auditor", label: "Auditor", icon: FileSearch, hint: "PDFs, contratos, licitaciones y URLs públicas" },
  { id: "economy", label: "Economía", icon: BarChart3, hint: "Canasta, dólar, inflación, rubros y mercado" },
];

const routeByMode: Record<Mode, string> = {
  assistant: "/asistente",
  auditor: "/auditor",
  economy: "/economia",
};

const starterPrompts = ["Formalizar empresa", "Consultar IPS", "Buscar en webs del gobierno", "Analizar noticias", "Conviene comprar dólares", "Subir licitación PDF"];

const demoDocs = [
  { name: "Licitación vial · demo", risk: "Amarillo", amount: "₲ 18.400M" },
  { name: "Contrato de insumos · demo", risk: "Verde", amount: "₲ 2.150M" },
  { name: "Adenda de obra pública · demo", risk: "Rojo", amount: "₲ 7.900M" },
];

const marketRows = [
  { label: "Canasta básica", value: "₲ 3.12M", trend: "+2.4% mensual" },
  { label: "USD/PYG", value: "₲ 7.430", trend: "+0.8% semanal" },
  { label: "Inflación estimada", value: "4.1%", trend: "estable" },
  { label: "Rubros con margen", value: "alimentos, logística", trend: "30/90 días" },
];

const getModeFromPath = (pathname: string): Mode => {
  if (pathname.includes("auditor")) return "auditor";
  if (pathname.includes("economia")) return "economy";
  return "assistant";
};

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const mode = getModeFromPath(location.pathname);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMode = useMemo(() => modes.find((item) => item.id === mode) ?? modes[0], [mode]);
  const ActiveIcon = activeMode.icon;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []).map((file) => file.name);
    setFiles((current) => [...current, ...selected]);
    event.target.value = "";
  };

  const goToMode = (nextMode: Mode) => navigate(routeByMode[nextMode]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
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
                  <SheetDescription>Inteligencia soberana para ciudadanía, auditoría pública y mercado.</SheetDescription>
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
                  IA prevista: Lovable AI Gateway con <span className="font-medium text-foreground">google/gemini-3-flash-preview</span> por defecto. Voz: ElevenLabs cuando conectemos la API.
                </div>
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-sm font-semibold tracking-normal">PY-OS · Inteligencia Soberana 🇵🇾</p>
              <p className="text-xs text-muted-foreground">Español · Guaraní · Jopara</p>
            </div>
          </div>
          <Badge variant="outline" className="hidden border-primary/30 bg-accent text-accent-foreground sm:inline-flex">
            MVP Paraguay
          </Badge>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
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
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-8">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
                  <ActiveIcon className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-3xl font-medium leading-tight sm:text-5xl">Mba&apos;éichapa, ¿en qué te ayudo?</h1>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{activeMode.hint}. Puedo preparar búsquedas en sitios públicos, leer archivos cargados, consultar noticias y estructurar análisis para el MVP.</p>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setMessage(prompt)}
                    className="rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="mx-auto w-full max-w-3xl">
              {files.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {files.map((file) => (
                    <span key={file} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs">
                      <Paperclip className="h-3.5 w-3.5 text-primary" />
                      {file}
                      <button onClick={() => setFiles((current) => current.filter((item) => item !== file))} aria-label={`Quitar ${file}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-border bg-background p-2 shadow-soft">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Escribí tu consulta, pegá una URL pública o pedí análisis de mercado..."
                  className="min-h-[92px] resize-none border-0 bg-transparent px-3 py-3 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2">
                  <div className="flex items-center gap-1">
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} accept=".pdf,.txt,.csv,.doc,.docx,.png,.jpg,.jpeg" />
                    <Button variant="ghost" size="icon" aria-label="Adjuntar archivos" onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Usar micrófono">
                      <Mic className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Buscar en la web pública">
                      <Globe2 className="h-5 w-5" />
                    </Button>
                  </div>
                  <Button size="icon" aria-label="Enviar mensaje">
                    <ArrowUp className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> escucha</span>
                <span className="inline-flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" /> habla</span>
                <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> markdown + streaming planificado</span>
              </div>
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-medium">Alcance de consulta</h2>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-risk-low" /> Webs del gobierno bajo demanda por URL o búsqueda asistida.</p>
              <p className="flex gap-2"><Newspaper className="mt-0.5 h-4 w-4 text-primary" /> Noticias y contexto público para contrastar respuestas.</p>
              <p className="flex gap-2"><Upload className="mt-0.5 h-4 w-4 text-primary" /> Archivos en asistente y auditor para lectura/análisis.</p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-medium">Auditor demo</h2>
            </div>
            <div className="grid gap-3">
              {demoDocs.map((doc) => (
                <div key={doc.name} className="rounded-lg border border-border bg-surface/60 p-3">
                  <p className="text-sm font-medium">{doc.name}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{doc.amount}</span>
                    <span className={cn("font-semibold", doc.risk === "Rojo" ? "text-risk-high" : doc.risk === "Amarillo" ? "text-risk-medium" : "text-risk-low")}>{doc.risk}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-medium">Mercado avanzado</h2>
            </div>
            <div className="grid gap-3">
              {marketRows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <span className="text-right text-sm font-semibold">{row.value}<span className="block text-xs font-normal text-muted-foreground">{row.trend}</span></span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
};

export default Index;