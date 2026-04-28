import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, FileSearch, Link2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PDF_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-pdf`;
const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-analyze`;
const AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

type Extracted = {
  filename: string; pages: number; chars: number;
  amounts: string[]; dates: string[]; parties: string[];
  risk: "Verde" | "Amarillo" | "Rojo"; reasons: string[];
  fullText: string; excerpt: string;
};

export default function AuditorView() {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [report, setReport] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    setError(null); setExtracted(null); setReport("");
    if (!url.trim() && !file) return setError("Pegá una URL o subí un PDF");
    setExtracting(true);
    try {
      let res: Response;
      if (file) {
        const fd = new FormData(); fd.append("file", file);
        res = await fetch(PDF_URL, { method: "POST", headers: { Authorization: AUTH }, body: fd });
      } else {
        res = await fetch(PDF_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: AUTH }, body: JSON.stringify({ url: url.trim() }) });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error extrayendo");
      setExtracted(data);
      setExtracting(false);
      // Continuar con análisis IA streaming
      setAnalyzing(true);
      const an = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: AUTH },
        body: JSON.stringify({ text: data.fullText, filename: data.filename }),
      });
      if (!an.ok || !an.body) throw new Error("No se pudo analizar");
      const reader = an.body.getReader();
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
            if (c) { soFar += c; setReport(soFar); }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setExtracting(false); setAnalyzing(false);
    }
  };

  const download = () => {
    if (!report) return;
    const blob = new Blob([`# Informe PY-OS\n\nDocumento: ${extracted?.filename}\n\n${report}`], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `informe-${extracted?.filename || "auditor"}.md`;
    a.click();
  };

  const riskColor = extracted?.risk === "Rojo" ? "bg-destructive text-destructive-foreground"
    : extracted?.risk === "Amarillo" ? "bg-[var(--risk-medium)] text-white"
    : "bg-[var(--risk-low)] text-white";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
          <FileSearch className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-serif text-3xl">Auditor público en vivo</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Subí un PDF o pegá una URL pública (DNCP, contratos, decretos, adendas).
          Extraigo el texto, busco montos, partes, plazos y un análisis IA en vivo con semáforo de riesgo.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.contrataciones.gov.py/.../licitacion.pdf"
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> {file ? file.name.slice(0, 18) : "Subir PDF"}
            </Button>
            <Button onClick={run} disabled={extracting || analyzing}>
              {(extracting || analyzing) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Auditar
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>

      {extracted && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Documento</p>
              <p className="font-medium">{extracted.filename}</p>
              <p className="text-xs text-muted-foreground">{extracted.pages} páginas · {extracted.chars.toLocaleString()} caracteres</p>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", riskColor)}>
              {extracted.risk}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Montos</p>
              <ul className="space-y-1 text-sm">
                {extracted.amounts.length ? extracted.amounts.map((a, i) => <li key={i} className="font-mono text-xs">{a}</li>) : <li className="text-muted-foreground">—</li>}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Partes</p>
              <ul className="space-y-1 text-sm">
                {extracted.parties.length ? extracted.parties.map((a, i) => <li key={i}>{a}</li>) : <li className="text-muted-foreground">—</li>}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Fechas</p>
              <ul className="space-y-1 text-sm">
                {extracted.dates.length ? extracted.dates.map((a, i) => <li key={i} className="text-xs">{a}</li>) : <li className="text-muted-foreground">—</li>}
              </ul>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {extracted.reasons.map((r, i) => (
              <span key={i} className="rounded-full bg-surface px-2.5 py-1 text-xs text-muted-foreground">{r}</span>
            ))}
          </div>
        </section>
      )}

      {(analyzing || report) && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl">Informe IA</h2>
            {report && !analyzing && (
              <Button size="sm" variant="outline" onClick={download} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Exportar .md
              </Button>
            )}
          </div>
          {analyzing && !report && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analizando con Gemini Pro... el razonamiento aparece en vivo.
            </p>
          )}
          {report && (
            <div className="prose-claude text-[15px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
