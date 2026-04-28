// Búsqueda web vía DuckDuckGo HTML (sin API key)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "es-PY,es;q=0.9,en;q=0.5",
};

function decodeDDG(href: string): string {
  // DuckDuckGo redirige: /l/?uddg=ENCODED
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const real = u.searchParams.get("uddg");
    return real ? decodeURIComponent(real) : href;
  } catch { return href; }
}

function strip(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { query } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: "query requerida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=py-es`;
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `DDG HTTP ${r.status}`, query, results: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const html = await r.text();
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Match cada resultado
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && results.length < 8) {
      const href = decodeDDG(m[1]);
      const title = strip(m[2]);
      const snippet = strip(m[3]);
      if (href.startsWith("http") && title) results.push({ title, url: href, snippet });
    }

    return new Response(JSON.stringify({
      query, results, count: results.length, fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error", results: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
