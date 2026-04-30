// Datos económicos en vivo Paraguay - múltiples fuentes con fallback + asesor con pensamiento crítico
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NAMES: Record<string, string> = {
  USD: "Dólar EE.UU.", EUR: "Euro", BRL: "Real brasileño", ARS: "Peso argentino",
  GBP: "Libra esterlina", JPY: "Yen", CHF: "Franco suizo", CLP: "Peso chileno", UYU: "Peso uruguayo",
};

type Rate = { code: string; name: string; buy: number | null; sell: number | null };
type EcoData = {
  rates: Rate[]; pdfUrl: string; source: string; houses: any;
  usdMid: number; sources: string[]; warnings: string[];
};

// ---------- Cache simple en memoria (frío al cold start) ----------
let CACHE: { at: number; data: EcoData } | null = null;
const CACHE_TTL = 60_000; // 60 s

async function tryDolarpy(): Promise<{ usdBuy: number; usdSell: number; houses: any } | null> {
  try {
    const r = await fetch("https://dolar.melizeche.com/api/1.0/", {
      headers: { "User-Agent": "Mozilla/5.0 PY-OS" },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const bcp = d?.dolarpy?.bcp;
    if (!bcp?.compra || !bcp?.venta) return null;
    return { usdBuy: Math.round(bcp.compra), usdSell: Math.round(bcp.venta), houses: d?.dolarpy || {} };
  } catch (e) { console.error("dolarpy err", e); return null; }
}

async function tryYadioPYG(): Promise<{ usdBuy: number; usdSell: number } | null> {
  try {
    const r = await fetch("https://api.yadio.io/exrates/PYG", { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const d = await r.json();
    const usd = d?.PYG?.USD;
    if (!usd) return null;
    const mid = 1 / usd; // 1 USD = mid PYG
    const spread = mid * 0.005;
    return { usdBuy: Math.round(mid - spread), usdSell: Math.round(mid + spread) };
  } catch (e) { console.error("yadio err", e); return null; }
}

async function tryExchangerateHost(): Promise<Record<string, number> | null> {
  try {
    const r = await fetch("https://api.exchangerate.host/latest?base=USD", { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.rates || null;
  } catch { return null; }
}

async function tryOpenERAPI(): Promise<Record<string, number> | null> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.rates || null;
  } catch { return null; }
}

async function getRates(): Promise<EcoData> {
  if (CACHE && Date.now() - CACHE.at < CACHE_TTL) return CACHE.data;

  const sources: string[] = [];
  const warnings: string[] = [];
  const rates: Rate[] = [];
  let usdMid = 7300;
  let houses: any = {};

  // 1) USD/PYG: dolarpy → yadio
  const dpy = await tryDolarpy();
  if (dpy) {
    rates.push({ code: "USD", name: NAMES.USD, buy: dpy.usdBuy, sell: dpy.usdSell });
    usdMid = (dpy.usdBuy + dpy.usdSell) / 2;
    houses = dpy.houses;
    sources.push("BCP via dolar.melizeche");
  } else {
    const yad = await tryYadioPYG();
    if (yad) {
      rates.push({ code: "USD", name: NAMES.USD, buy: yad.usdBuy, sell: yad.usdSell });
      usdMid = (yad.usdBuy + yad.usdSell) / 2;
      sources.push("Yadio (interbancario)");
      warnings.push("BCP no disponible, usando interbancario Yadio");
    } else {
      warnings.push("No se pudo obtener USD/PYG en vivo, usando referencia anterior");
    }
  }

  // 2) Otras monedas: exchangerate.host → open.er-api
  let er = await tryExchangerateHost();
  if (er) sources.push("exchangerate.host");
  if (!er) {
    er = await tryOpenERAPI();
    if (er) sources.push("open.er-api");
  }

  if (er) {
    for (const code of ["EUR", "BRL", "ARS", "GBP", "JPY", "CHF", "CLP", "UYU"]) {
      const usdToCcy = er[code];
      if (!usdToCcy || usdToCcy <= 0) continue;
      const mid = usdMid / usdToCcy;
      const spread = mid * 0.012; // 1.2% spread estimado para no-USD
      const buy = Math.round(mid - spread);
      const sell = Math.round(mid + spread);
      // ARS/CLP/JPY pueden ser muy bajos en PYG → mostrar más precision
      if (sell > 0 && buy >= 0 && sell < 1e9) {
        rates.push({ code, name: NAMES[code], buy, sell });
      }
    }
  } else {
    warnings.push("Sin proveedor de cross-rates: solo USD disponible");
  }

  const data: EcoData = {
    rates,
    pdfUrl: "https://www.bcp.gov.py/cotizacion-referencial-en-guaranies-i365",
    source: sources.join(" + ") || "fallback",
    houses, usdMid, sources, warnings,
  };
  CACHE = { at: Date.now(), data };
  return data;
}

// ---------- Asesor con pensamiento crítico + memoria ----------
const ADVISOR_SYSTEM = (ratesCtx: string, profile: string, memory: string) => `Sos un asesor económico paraguayo experto, con pensamiento crítico riguroso.

DATOS DE COTIZACIÓN HOY (referenciales BCP, en guaraníes):
${ratesCtx}

PERFIL DEL USUARIO: ${profile || "general"}.

${memory ? `LO QUE YA SABEMOS DEL USUARIO (memoria de conversaciones previas):\n${memory}\n` : ""}

REGLAS DE PENSAMIENTO CRÍTICO:
1. SIEMPRE razoná ANTES de recomendar: ¿qué dicen los números? ¿qué tendencia? ¿qué riesgos?
2. Si el usuario pide una predicción, dale un rango con probabilidades cualitativas (alta/media/baja) y los supuestos detrás.
3. Distinguí HECHO (lo que muestran las cifras) de OPINIÓN (tu lectura).
4. Mencioná SIEMPRE al menos 1 riesgo o contraindicación.
5. Sé concreto en guaraníes: pasos, montos, plazos, dónde hacerlo (cambios serios, banco, agencia).
6. Si te falta dato (ej. monto, plazo, ingreso), pedilo brevemente al final.
7. NO inventes datos macro que no estén arriba. Si no tenés inflación o tasa, decilo.
8. Formato: markdown breve. Máximo 250 palabras. Usá secciones cortas: **Lectura**, **Recomendación**, **Riesgos**, **Próximo paso**.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "data";

  if (action === "advisor" && req.method === "POST") {
    try {
      const { question, profile, rates, memory } = await req.json();
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurado");

      const ratesCtx = rates?.length
        ? rates.map((r: any) => `- ${r.code} (${r.name}): compra ₲${r.buy?.toLocaleString("es-PY")} / venta ₲${r.sell?.toLocaleString("es-PY")}`).join("\n")
        : "(sin datos en este momento)";

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: ADVISOR_SYSTEM(ratesCtx, profile, memory || "") },
            { role: "user", content: question },
          ],
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

  // Predicción simple basada en datos
  if (action === "predict" && req.method === "POST") {
    try {
      const { code, history } = await req.json();
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurado");

      const PROMPT = `Datos históricos recientes de ${code}/PYG (últimos puntos, más antiguos primero):
${history.map((h: any, i: number) => `${i + 1}. ${new Date(h.at).toLocaleString("es-PY")} → mid ₲${h.mid}`).join("\n")}

Hacé una proyección breve para los próximos 7 días con pensamiento crítico:
- Tendencia observada (subiendo/bajando/lateral) con magnitud aproximada.
- Rango esperado en 7 días con probabilidad (alta/media/baja).
- 2 supuestos clave que estás asumiendo.
- 1 riesgo principal que invalidaría la predicción.
Máximo 150 palabras, markdown.`;

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: PROMPT }],
          stream: true,
        }),
      });
      if (!r.ok) return new Response(JSON.stringify({ error: "Error gateway IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  try {
    const data = await getRates();
    const usd = data.rates.find((r) => r.code === "USD");
    return new Response(JSON.stringify({
      source: data.source,
      sources: data.sources,
      warnings: data.warnings,
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
