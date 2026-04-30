// Búsqueda web — Brave Search HTML primario, DuckDuckGo lite fallback
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEADERS: HeadersInit = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-PY,es;q=0.9,en;q=0.7",
  "Accept-Encoding": "identity",
  "Cache-Control": "no-cache",
};

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

type Result = { title: string; url: string; snippet: string; source: string };

async function searchBrave(query: string): Promise<Result[]> {
  const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000), redirect: "follow" });
  if (!r.ok) return [];
  const html = await r.text();
  const results: Result[] = [];

  // Cada bloque empieza con data-type="web"
  const parts = html.split('data-type="web"').slice(1);
  for (const part of parts) {
    if (results.length >= 10) break;
    const block = part.slice(0, 4000);
    const linkM = block.match(/<a\s+href="(https?:\/\/[^"]+)"[^>]*class="svelte-14r20fy l1"/);
    if (!linkM) continue;
    const url = linkM[1];
    const titleM = block.match(/<div class="title[^"]*"[^>]*title="([^"]+)"/);
    const title = titleM ? strip(titleM[1]) : strip((block.match(/<div class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1]) || "");
    const snipM = block.match(/<div class="content [^"]*line-clamp-dynamic[^"]*"[^>]*>([\s\S]*?)<\/div>/)
      || block.match(/<div class="snippet-description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const snippet = snipM ? strip(snipM[1]).slice(0, 280) : "";
    if (title && url.startsWith("http")) {
      results.push({ title, url, snippet, source: "brave" });
    }
  }
  return results;
}

async function searchDDG(query: string): Promise<Result[]> {
  // DDG Lite (más estable que html.duckduckgo.com)
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=py-es`;
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return [];
  const html = await r.text();
  const results: Result[] = [];
  const re = /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && results.length < 10) {
    let href = m[1];
    if (href.startsWith("//")) href = "https:" + href;
    // DDG redirect: //duckduckgo.com/l/?uddg=...
    try {
      const u = new URL(href);
      const real = u.searchParams.get("uddg");
      if (real) href = decodeURIComponent(real);
    } catch {}
    if (!href.startsWith("http")) continue;
    const title = strip(m[2]);
    if (title && title.length > 3) results.push({ title, url: href, snippet: "", source: "ddg" });
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query requerida", results: [] }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let results: Result[] = [];
    let engine = "brave";
    try { results = await searchBrave(query); } catch (e) { console.error("brave err", e); }

    if (results.length === 0) {
      engine = "ddg";
      try { results = await searchDDG(query); } catch (e) { console.error("ddg err", e); }
    }

    return new Response(JSON.stringify({
      query, engine, results, count: results.length,
      fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error", results: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
