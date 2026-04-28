import { createFileRoute } from "@tanstack/react-router";
import { extractText, getDocumentProxy } from "unpdf";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type Risk = "Verde" | "Amarillo" | "Rojo";

function detectRisk(text: string): { risk: Risk; reasons: string[] } {
  const t = text.toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  if (/adjudicaci[oó]n directa|sin licitaci[oó]n|excepci[oó]n/.test(t)) {
    score += 2; reasons.push("Adjudicación directa o excepción detectada");
  }
  if (/adenda|ampliaci[oó]n de monto|adicional/.test(t)) {
    score += 1; reasons.push("Adenda o ampliación de monto");
  }
  if (/urgencia|emergencia/.test(t)) {
    score += 1; reasons.push("Procedimiento de urgencia");
  }
  if (/un solo oferente|único oferente/.test(t)) {
    score += 2; reasons.push("Un solo oferente");
  }
  if (/llave en mano/.test(t)) {
    score += 1; reasons.push("Contrato llave en mano");
  }
  const risk: Risk = score >= 3 ? "Rojo" : score >= 1 ? "Amarillo" : "Verde";
  if (reasons.length === 0) reasons.push("Sin señales evidentes de riesgo en el texto");
  return { risk, reasons };
}

function extractAmounts(text: string): string[] {
  const out = new Set<string>();
  // Guaraníes: ₲ 18.400.000.000 / Gs. 18.400.000 / 18.400.000 Gs
  const reGs = /(?:₲|Gs\.?|guaran[ií]es?)\s*([0-9][0-9\.\,]{2,})|([0-9][0-9\.\,]{4,})\s*(?:Gs\.?|guaran[ií]es?)/gi;
  // USD
  const reUsd = /(?:US\$|USD|U\$S|D[oó]lares?)\s*([0-9][0-9\.\,]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = reGs.exec(text)) !== null) {
    const num = m[1] || m[2];
    if (num) out.add(`₲ ${num}`);
  }
  while ((m = reUsd.exec(text)) !== null) {
    if (m[1]) out.add(`US$ ${m[1]}`);
  }
  return Array.from(out).slice(0, 8);
}

function extractDates(text: string): string[] {
  const out = new Set<string>();
  const re = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b|\b(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add((m[1] || m[2]).trim());
  }
  return Array.from(out).slice(0, 6);
}

function extractParties(text: string): string[] {
  const out = new Set<string>();
  const re = /\b(S\.?A\.?|S\.?R\.?L\.?|EBY|MOPC|MEC|MSP(?:yBS)?|IPS|SET|MUNICIPALIDAD DE [A-ZÁÉÍÓÚÑ ]+|MINISTERIO DE [A-ZÁÉÍÓÚÑ ]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add(m[1].trim());
  }
  return Array.from(out).slice(0, 8);
}

async function readPdf(buf: Uint8Array) {
  const doc = await getDocumentProxy(buf);
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : text;
  return { text: merged, pages: totalPages };
}

export const Route = createFileRoute("/api/audit-pdf")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get("content-type") || "";
          let bytes: Uint8Array | null = null;
          let filename = "documento.pdf";

          if (ct.includes("application/json")) {
            const body = (await request.json()) as { url?: string };
            if (!body.url) {
              return new Response(JSON.stringify({ error: "url requerido" }), {
                status: 400, headers: { "Content-Type": "application/json", ...CORS },
              });
            }
            const r = await fetch(body.url, { signal: AbortSignal.timeout(15000) });
            if (!r.ok) {
              return new Response(JSON.stringify({ error: `No se pudo descargar el PDF (${r.status})` }), {
                status: 400, headers: { "Content-Type": "application/json", ...CORS },
              });
            }
            bytes = new Uint8Array(await r.arrayBuffer());
            filename = body.url.split("/").pop() || filename;
          } else {
            const form = await request.formData();
            const file = form.get("file");
            if (!(file instanceof File)) {
              return new Response(JSON.stringify({ error: "file requerido" }), {
                status: 400, headers: { "Content-Type": "application/json", ...CORS },
              });
            }
            filename = file.name;
            bytes = new Uint8Array(await file.arrayBuffer());
          }

          if (!bytes || bytes.byteLength < 100) {
            return new Response(JSON.stringify({ error: "PDF inválido o vacío" }), {
              status: 400, headers: { "Content-Type": "application/json", ...CORS },
            });
          }

          const { text, pages } = await readPdf(bytes);
          const amounts = extractAmounts(text);
          const dates = extractDates(text);
          const parties = extractParties(text);
          const { risk, reasons } = detectRisk(text);

          return new Response(
            JSON.stringify({
              filename, pages,
              chars: text.length,
              amounts, dates, parties,
              risk, reasons,
              excerpt: text.slice(0, 800),
              fetchedAt: new Date().toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al procesar PDF";
          return new Response(JSON.stringify({ error: msg }), {
            status: 500, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});