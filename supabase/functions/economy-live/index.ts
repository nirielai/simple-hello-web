// Datos económicos en vivo Paraguay - APIs públicas (BCP via dolarpy + er-api)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NAMES: Record<string, string> = {
  USD: "Dólar EE.UU.", EUR: "Euro", BRL: "Real brasileño", ARS: "Peso argentino",
  GBP: "Libra esterlina", JPY: "Yen", CHF: "Franco suizo", CLP: "Peso chileno", UYU: "Peso uruguayo",
};

type Rate = { code: string; name: string; buy: number | null; sell: number | null };

async function getRates(): Promise<{ rates: Rate[]; pdfUrl: string; source: string; houses?: any }> {
  const rates: Rate[] = [];
  let usdMid = 7300; // fallback razonable
  let houses: any = {};

  // 1) BCP via dolar.melizeche.com (proxy del BCP)
  try {
    const r = await fetch("https://dolar.melizeche.com/api/1.0/", {
      headers: { "User-Agent": "Mozilla/5.0 PY-OS" },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const d = await r.json();
      const bcp = d?.dolarpy?.bcp;
      houses = d?.dolarpy || {};
      if (bcp?.compra && bcp?.venta) {
        rates.push({ code: "USD", name: NAMES.USD, buy: Math.round(bcp.compra), sell: Math.round(bcp.venta) });
        usdMid = (bcp.compra + bcp.venta) / 2;
      }
    }
  } catch (e) { console.error("dolarpy err", e); }

  // 2) Otras monedas via open.er-api (USD base, multiplico por PYG)
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = await r.json();
      const er = d?.rates || {};
      for (const code of ["EUR", "BRL", "ARS", "GBP", "JPY", "CHF", "CLP", "UYU"]) {
        const usdToCcy = er[code];
        if (!usdToCcy) continue;
        // 1 ccy = (usdMid / usdToCcy) PYG (mid)
        const mid = usdMid / usdToCcy;
        const spread = mid * 0.01; // 1% spread estimado
        const buy = Math.round(mid - spread);
        const sell = Math.round(mid + spread);
        if (buy > 0 && sell > 0 && buy < 1e9) {
          rates.push({ code, name: NAMES[code], buy, sell });
        }
      }
    }
  } catch (e) { console.error("er-api err", e); }

  return {
    rates,
    pdfUrl: "https://www.bcp.gov.py/cotizacion-referencial-en-guaranies-i365",
    source: "BCP (vía dolar.melizeche) + open.er-api",
    houses,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "data";

  if (action === "advisor" && req.method === "POST") {
    try {
      const { question, profile, rates } = await req.json();
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurado");

      const ratesCtx = rates?.length
        ? rates.map((r: any) => `${r.code} (${r.name}): compra ₲${r.buy} / venta ₲${r.sell}`).join("\n")
        : "(sin datos en este momento)";

      const SYSTEM = `Sos un asesor económico paraguayo. Hablás claro, sin jerga.
Datos de cotización HOY (referenciales BCP):
${ratesCtx}

Perfil del usuario: ${profile || "general"}.

Respondés en español paraguayo, recomendaciones accionables. Markdown breve, números reales. Si te falta info, pedila o decilo.`;

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
      if (r.status === 402) return new Response(JSON.stringify({ error: "Sin créditos Lovable AI." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!r.ok) {
        console.error("advisor gw err", r.status, await r.text());
        return new Response(JSON.stringify({ error: "Error gateway IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    } catch (e) {
      console.error("advisor err", e);
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  try {
    const data = await getRates();
    const usd = data.rates.find((r) => r.code === "USD");
    return new Response(JSON.stringify({
      source: data.source,
      fetchedAt: new Date().toISOString(),
      pdfUrl: data.pdfUrl,
      rates: data.rates,
      houses: data.houses,
      usdPyg: {
        buy: usd?.buy ?? null, sell: usd?.sell ?? null,
        midpoint: usd?.buy && usd?.sell ? Math.round((usd.buy + usd.sell) / 2) : null,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("eco err", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
