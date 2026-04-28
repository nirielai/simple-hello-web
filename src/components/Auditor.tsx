import { useState } from "react";
import { Upload, Link as LinkIcon, FileText, Loader2, ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extraerTextoPdf, base64ToArrayBuffer } from "@/lib/pdf";
import { Markdown } from "./Markdown";

type Hallazgo = { severidad: "info" | "advertencia" | "alerta"; titulo: string; descripcion: string };
type Analisis = {
  tipo_documento: string;
  titulo: string;
  resumen_ejecutivo: string;
  partes_involucradas: string[];
  montos: { concepto: string; valor: string }[];
  plazos: string[];
  hallazgos: Hallazgo[];
  semaforo: "verde" | "amarillo" | "rojo";
  recomendacion: string;
};

const DEMOS = [
  {
    titulo: "Licitación de demostración — Reparación de ruta",
    fuente: "Demo · Licitación pública (ejemplo)",
    texto: `LICITACIÓN PÚBLICA NACIONAL Nº 145/2024
MOPC - Ministerio de Obras Públicas y Comunicaciones
Objeto: Reparación y bacheo de la Ruta PY02, tramo Caaguazú - Coronel Oviedo (45 km).
Monto estimado: Gs. 18.500.000.000 (dieciocho mil quinientos millones de guaraníes).
Plazo de ejecución: 90 días corridos desde la firma del contrato.
Plazo para presentación de ofertas: 8 días hábiles desde la publicación.
Garantía de oferta: 5% del monto ofertado.
Adjudicación: Por precio más bajo evaluado.
Especificaciones: Carpeta asfáltica de 5 cm, base granular existente. No se exige análisis de suelo previo.
Forma de pago: 80% por avance de obra, 20% al recibir conformidad final.
El proveedor adjudicado deberá presentar antecedentes mínimos de 3 obras similares en los últimos 5 años.
Cláusula 12.4: La empresa adjudicada podrá subcontratar hasta el 70% de la obra sin autorización previa.`,
  },
  {
    titulo: "Decreto de demostración — Subsidio agrícola",
    fuente: "Demo · Decreto del Poder Ejecutivo (ejemplo)",
    texto: `DECRETO Nº 8.421/2024
POR EL CUAL SE ESTABLECE UN SUBSIDIO EXCEPCIONAL PARA PRODUCTORES DE SOJA AFECTADOS POR LA SEQUÍA.
Artículo 1°: Asígnase la suma de Gs. 95.000.000.000 del Tesoro Nacional para subsidios directos.
Artículo 2°: Beneficiarios: productores con plantaciones entre 50 y 5.000 hectáreas registrados en el MAG.
Artículo 3°: El subsidio será de Gs. 1.200.000 por hectárea afectada, con un tope de Gs. 850.000.000 por productor.
Artículo 4°: La verificación de daños será realizada por el MAG en coordinación con gremios del sector.
Artículo 5°: Plazo de inscripción: 15 días desde la publicación en la Gaceta Oficial.
Artículo 6°: La asignación de fondos no requiere licitación al ser declarada de urgencia nacional.`,
  },
];

export function Auditor() {
  const [paso, setPaso] = useState<"inicio" | "procesando" | "resultado">("inicio");
  const [error, setError] = useState<string | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [url, setUrl] = useState("");
  const [estado, setEstado] = useState("");

  async function analizar(texto: string, fuente: string) {
    setError(null);
    setPaso("procesando");
    setEstado("Analizando con IA…");
    try {
      const { data, error } = await supabase.functions.invoke("analizar-documento", {
        body: { texto, fuente },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAnalisis(data.analisis);
      setPaso("resultado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar");
      setPaso("inicio");
    }
  }

  async function manejarArchivo(file: File) {
    try {
      setPaso("procesando");
      setEstado("Leyendo PDF…");
      const buf = await file.arrayBuffer();
      const texto = await extraerTextoPdf(buf);
      if (!texto || texto.length < 50) throw new Error("No se pudo extraer texto del PDF (¿es escaneado?)");
      await analizar(texto, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al leer el PDF");
      setPaso("inicio");
    }
  }

  async function manejarUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      setPaso("procesando");
      setEstado("Descargando documento desde la web gubernamental…");
      const { data, error } = await supabase.functions.invoke("descargar-documento", { body: { url } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      let texto: string;
      if (data.tipo === "pdf") {
        setEstado("Extrayendo texto del PDF…");
        const buf = base64ToArrayBuffer(data.base64);
        texto = await extraerTextoPdf(buf);
      } else {
        texto = data.texto;
      }
      if (!texto || texto.length < 50) throw new Error("Documento vacío o ilegible");
      await analizar(texto, data.fuente);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al descargar");
      setPaso("inicio");
    }
  }

  if (paso === "procesando") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="serif text-xl">{estado}</p>
          <p className="text-sm text-muted-foreground mt-1">Esto puede tomar 10-30 segundos.</p>
        </div>
      </div>
    );
  }

  if (paso === "resultado" && analisis) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => { setPaso("inicio"); setAnalisis(null); }}
            className="text-sm text-primary hover:underline mb-6"
          >
            ← Analizar otro documento
          </button>
          <SemaforoBanner s={analisis.semaforo} />
          <p className="text-xs uppercase tracking-wider text-muted-foreground mt-6 mb-1">
            {analisis.tipo_documento}
          </p>
          <h2 className="serif text-3xl mb-4 text-balance">{analisis.titulo}</h2>

          <div className="py-card p-5 mb-4">
            <h3 className="serif text-lg mb-2">Resumen ejecutivo</h3>
            <p className="leading-relaxed">{analisis.resumen_ejecutivo}</p>
          </div>

          <div className="py-card p-5 mb-4">
            <h3 className="serif text-lg mb-2">Recomendación</h3>
            <p className="leading-relaxed">{analisis.recomendacion}</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div className="py-card p-5">
              <h3 className="serif text-lg mb-2">Partes involucradas</h3>
              <ul className="space-y-1 text-sm">
                {analisis.partes_involucradas.map((p, i) => <li key={i}>• {p}</li>)}
              </ul>
            </div>
            <div className="py-card p-5">
              <h3 className="serif text-lg mb-2">Plazos</h3>
              <ul className="space-y-1 text-sm">
                {analisis.plazos.map((p, i) => <li key={i}>• {p}</li>)}
              </ul>
            </div>
          </div>

          {analisis.montos.length > 0 && (
            <div className="py-card p-5 mb-4">
              <h3 className="serif text-lg mb-3">Montos</h3>
              <div className="space-y-2">
                {analisis.montos.map((m, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                    <span className="text-muted-foreground">{m.concepto}</span>
                    <span className="font-semibold">{m.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="py-card p-5">
            <h3 className="serif text-lg mb-3">Hallazgos</h3>
            <div className="space-y-3">
              {analisis.hallazgos.map((h, i) => <HallazgoItem key={i} h={h} />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="serif text-4xl mb-3 text-balance">Auditor de documentos públicos</h1>
          <p className="text-muted-foreground">
            Subí una licitación, decreto o contrato y PY-OS lo desglosa, detecta sobrecostos e irregularidades.
          </p>
        </div>

        {error && (
          <div className="py-card p-4 mb-6 border-danger/40 bg-danger/5 text-danger text-sm">
            {error}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <label className="py-card p-6 cursor-pointer hover:border-primary/40 transition-colors block">
            <Upload className="w-6 h-6 text-primary mb-3" />
            <div className="serif text-lg mb-1">Subir un PDF</div>
            <div className="text-sm text-muted-foreground">Licitación, decreto, contrato, resolución…</div>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && manejarArchivo(e.target.files[0])}
            />
          </label>

          <form onSubmit={manejarUrl} className="py-card p-6">
            <LinkIcon className="w-6 h-6 text-primary mb-3" />
            <div className="serif text-lg mb-1">Pegá una URL</div>
            <div className="text-sm text-muted-foreground mb-3">
              Ej: enlace a un PDF de DNCP, Gaceta Oficial, etc.
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:border-primary/60"
            />
            <button
              type="submit"
              className="mt-3 w-full text-sm py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              Analizar
            </button>
          </form>
        </div>

        <div>
          <h2 className="serif text-xl mb-3">O probá con ejemplos</h2>
          <div className="space-y-2">
            {DEMOS.map((d) => (
              <button
                key={d.titulo}
                onClick={() => analizar(d.texto, d.fuente)}
                className="w-full text-left py-card p-4 hover:border-primary/40 transition-colors flex items-start gap-3"
              >
                <FileText className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{d.titulo}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{d.fuente}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SemaforoBanner({ s }: { s: "verde" | "amarillo" | "rojo" }) {
  const cfg = {
    verde: { Icon: ShieldCheck, bg: "bg-success/10", text: "text-success", border: "border-success/30", label: "Sin alertas significativas" },
    amarillo: { Icon: AlertTriangle, bg: "bg-warning/10", text: "text-warning", border: "border-warning/30", label: "Puntos a revisar" },
    rojo: { Icon: ShieldAlert, bg: "bg-danger/10", text: "text-danger", border: "border-danger/30", label: "Posibles irregularidades" },
  }[s];
  const { Icon, bg, text, border, label } = cfg;
  return (
    <div className={`flex items-center gap-3 p-4 rounded-2xl border ${bg} ${border}`}>
      <Icon className={`w-6 h-6 ${text}`} />
      <div>
        <div className={`font-semibold ${text}`}>Semáforo: {s.toUpperCase()}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function HallazgoItem({ h }: { h: Hallazgo }) {
  const color = h.severidad === "alerta" ? "text-danger" : h.severidad === "advertencia" ? "text-warning" : "text-muted-foreground";
  return (
    <div className="border-l-2 border-border pl-4">
      <div className={`text-xs uppercase tracking-wider font-semibold ${color}`}>{h.severidad}</div>
      <div className="font-medium">{h.titulo}</div>
      <div className="text-sm text-muted-foreground">{h.descripcion}</div>
    </div>
  );
}
