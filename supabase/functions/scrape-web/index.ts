// Scraping de webs públicas paraguayas - devuelve texto limpio
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url requerida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 PY-OS Citizen Bot",
        Accept: "text/html,application/xhtml+xml,application/json",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!r.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${r.status} al obtener ${url}`, url }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ct = r.headers.get("content-type") || "";
    const body = await r.text();
    const text = ct.includes("html") ? cleanHtml(body) : body;
    const truncated = text.slice(0, 8000);

    return new Response(JSON.stringify({
      url, contentType: ct,
      text: truncated,
      truncated: text.length > 8000,
      fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error scraping" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
