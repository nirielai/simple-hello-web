// Extracción de texto de PDFs públicos paraguayos
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@1.6.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Risk = "Verde" | "Amarillo" | "Rojo";

function detectRisk(text: string): { risk: Risk; reasons: string[] } {
  const t = text.toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  if (/adjudicaci[oó]n directa|sin licitaci[oó]n|excepci[oó]n/.test(t)) { score += 2; reasons.push("Adjudicación directa o excepción"); }
  if (/adenda|ampliaci[oó]n de monto|adicional/.test(t)) { score += 1; reasons.push("Adenda o ampliación"); }
  if (/urgencia|emergencia/.test(t)) { score += 1; reasons.push("Urgencia/emergencia"); }
  if (/un solo oferente|único oferente/.test(t)) { score += 2; reasons.push("Único oferente"); }
  if (/llave en mano/.test(t)) { score += 1; reasons.push("Llave en mano"); }
  const risk: Risk = score >= 3 ? "Rojo" : score >= 1 ? "Amarillo" : "Verde";
  if (!reasons.length) reasons.push("Sin señales evidentes");
  return { risk, reasons };
}

function extractAmounts(text: string) {
  const out = new Set<string>();
  const reGs = /(?:₲|Gs\.?|guaran[ií]es?)\s*([0-9][0-9\.\,]{2,})|([0-9][0-9\.\,]{4,})\s*(?:Gs\.?|guaran[ií]es?)/gi;
  const reUsd = /(?:US\$|USD|U\$S|D[oó]lares?)\s*([0-9][0-9\.\,]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = reGs.exec(text)) !== null) { const n = m[1] || m[2]; if (n) out.add(`₲ ${n}`); }
  while ((m = reUsd.exec(text)) !== null) { if (m[1]) out.add(`US$ ${m[1]}`); }
  return Array.from(out).slice(0, 10);
}

function extractDates(text: string) {
  const out = new Set<string>();
  const re = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b|\b(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add((m[1] || m[2]).trim());
  return Array.from(out).slice(0, 8);
}

function extractParties(text: string) {
  const out = new Set<string>();
  const re = /\b(S\.?A\.?|S\.?R\.?L\.?|EBY|MOPC|MEC|MSP(?:yBS)?|IPS|SET|DNCP|MUNICIPALIDAD DE [A-ZÁÉÍÓÚÑ ]+|MINISTERIO DE [A-ZÁÉÍÓÚÑ ]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1].trim());
  return Array.from(out).slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ct = req.headers.get("content-type") || "";
    let bytes: Uint8Array | null = null;
    let filename = "documento.pdf";

    if (ct.includes("application/json")) {
      const { url } = await req.json();
      if (!url) throw new Error("url requerida");
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`No se pudo descargar (${r.status})`);
      bytes = new Uint8Array(await r.arrayBuffer());
      filename = url.split("/").pop() || filename;
    } else {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("archivo requerido");
      filename = file.name;
      bytes = new Uint8Array(await file.arrayBuffer());
    }

    if (!bytes || bytes.byteLength < 100) throw new Error("PDF inválido o vacío");

    const doc = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(doc, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;

    const { risk, reasons } = detectRisk(merged);
    return new Response(JSON.stringify({
      filename, pages: totalPages, chars: merged.length,
      amounts: extractAmounts(merged),
      dates: extractDates(merged),
      parties: extractParties(merged),
      risk, reasons,
      excerpt: merged.slice(0, 1200),
      fullText: merged.slice(0, 30000),
      fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
