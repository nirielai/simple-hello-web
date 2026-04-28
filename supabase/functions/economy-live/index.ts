// Datos económicos en vivo del BCP + canasta + asesor IA streaming
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@1.6.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BCP_INDEX = "https://www.bcp.gov.py/cotizacion-referencial-en-guaranies-i365";
const KNOWN: Record<string, string> = {
  USD: "Dólar EE.UU.", EUR: "Euro", BRL: "Real", ARS: "Peso argentino",
  GBP: "Libra", JPY: "Yen", CHF: "Franco suizo", CLP: "Peso chileno", UYU: "Peso uruguayo",
};

function parseNum(s: string): number | null {
  if (!s) return null;
  const c = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseRates(text: string) {
  const rates: Array<{ code: string; name: string; buy: number | null; sell: number | null }> = [];
  for (const line of text.split(/\r?\n+/)) {
    for (const [code, name] of Object.entries(KNOWN)) {
      const m = line.match(new RegExp(`\\b${code}\\b.*?([0-9][0-9\\.,]{2,})\\s+([0-9][0-9\\.,]{2,})`, "i"));
      if (m && !rates.find((r) => r.code === code)) {
        const buy = parseNum(m[1]); const sell = parseNum(m[2]);
        if (buy && sell) rates.push({ code, name, buy, sell });
      }
    }
  }
  return rates;
}

async function getBCP() {
  const idx = await fetch(BCP_INDEX, {
    headers: { "User-Agent": "Mozilla/5.0 PY-OS" },
    signal: AbortSignal.timeout(10000),
  });
  const html = await idx.text();
  const m = html.match(/href="([^"]+\.pdf)"/i);
  if (!m) return { rates: [], pdfUrl: BCP_INDEX, raw: "" };
  const pdfUrl = m[1].startsWith("http") ? m[1] : `https://www.bcp.gov.py${m[1].startsWith("/") ? "" : "/"}${m[1]}`;
  const pdf = await fetch(pdfUrl, { headers: { "User-Agent": "Mozilla/5.0 PY-OS" }, signal: AbortSignal.timeout(15000) });
  const buf = new Uint8Array(await pdf.arrayBuffer());
  const doc = await getDocumentProxy(buf);
  const { text } = await extractText(doc, { mergePages: true });
  const raw = Array.isArray(text) ? text.join("\n") : text;
  return { rates: parseRates(raw), pdfUrl, raw: raw.slice(0, 4000) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "data";

  // ----- ASESOR IA streaming -----
  if (action === "advisor" && req.method === "POST") {
    try {
      const { question, profile, rates } = await req.json();
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurado");

      const ratesCtx = rates?.length
        ? rates.map((r: any) => `${r.code} (${r.name}): compra ₲${r.buy} / venta ₲${r.sell}`).join("\n")
        : "(sin datos del BCP en este momento)";

      const SYSTEM = `Sos un asesor económico paraguayo. Hablás claro, sin jerga.
Datos del BCP HOY:
${ratesCtx}

Perfil del usuario: ${profile || "general"}.

Respondés en español rioplatense paraguayo, con recomendaciones accionables. Markdown breve. Si no tenés datos, decilo.`;

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: question }],
          stream: true,
        }),
      });
      if (r.status === 429) return new Response(JSON.stringify({ error: "Demasiadas consultas." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (r.status === 402) return new Response(JSON.stringify({ error: "Sin créditos." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!r.ok) return new Response(JSON.stringify({ error: "gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // ----- DATOS BCP -----
  try {
    const fetchedAt = new Date().toISOString();
    const bcp = await getBCP();
    const usd = bcp.rates.find((r) => r.code === "USD");
    const usdPyg = {
      buy: usd?.buy ?? null,
      sell: usd?.sell ?? null,
      midpoint: usd?.buy && usd?.sell ? Math.round(((usd.buy + usd.sell) / 2) * 100) / 100 : null,
    };
    return new Response(JSON.stringify({
      source: "Banco Central del Paraguay",
      fetchedAt, pdfUrl: bcp.pdfUrl, rates: bcp.rates, usdPyg, raw: bcp.raw,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
