// Búsqueda web avanzada — múltiples engines en paralelo, filtros temporales y de sitio
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEADERS: HeadersInit = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-PY,es;q=0.9,en;q=0.7",
  "Accept-Encoding": "identity",
  "Cache-Control": "no-cache",
};

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

type Result = { title: string; url: string; snippet: string; source: string };

function dedupe(results: Result[]): Result[] {
  const seen = new Set<string>();
  const out: Result[] = [];
  for (const r of results) {
    const key = r.url.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function searchBrave(query: string): Promise<Result[]> {
  const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000), redirect: "follow" });
  if (!r.ok) return [];
  const html = await r.text();
  const results: Result[] = [];
  const parts = html.split('data-type="web"').slice(1);
  for (const part of parts) {
    if (results.length >= 10) break;
    const block = part.slice(0, 4000);
    const linkM = block.match(/<a\s+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*l1[^"]*"/);
    if (!linkM) continue;
    const titleM = block.match(/<div class="title[^"]*"[^>]*title="([^"]+)"/) ||
      block.match(/<div class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const snipM = block.match(/<div class="content [^"]*line-clamp-dynamic[^"]*"[^>]*>([\s\S]*?)<\/div>/) ||
      block.match(/<div class="snippet-description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const title = titleM ? strip(titleM[1]) : "";
    if (title && linkM[1].startsWith("http")) {
      results.push({ title, url: linkM[1], snippet: snipM ? strip(snipM[1]).slice(0, 280) : "", source: "brave" });
    }
  }
  return results;
}

async function searchDDG(query: string): Promise<Result[]> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=py-es`;
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const html = await r.text();
  const results: Result[] = [];
  const re = /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && results.length < 10) {
    let href = m[1];
    if (href.startsWith("//")) href = "https:" + href;
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

async function searchStartpage(query: string): Promise<Result[]> {
  // Startpage es proxy de Google → resultados frescos
  const url = `https://www.startpage.com/sp/search?query=${encodeURIComponent(query)}&cat=web&pl=opensearch&language=spanish`;
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000), redirect: "follow" });
  if (!r.ok) return [];
  const html = await r.text();
  const results: Result[] = [];
  const re = /<a[^>]+class="[^"]*w-gl__result-title[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<p[^>]+class="[^"]*w-gl__description[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && results.length < 10) {
    const u = m[1];
    if (!u.startsWith("http")) continue;
    results.push({ title: strip(m[2]), url: u, snippet: strip(m[4]).slice(0, 280), source: "startpage" });
  }
  return results;
}

async function searchSearX(query: string): Promise<Result[]> {
  // Mirrors públicos de SearXNG con JSON
  const mirrors = [
    "https://searx.be",
    "https://search.brave4u.com",
    "https://searx.tiekoetter.com",
    "https://search.inetol.net",
  ];
  for (const m of mirrors) {
    try {
      const r = await fetch(`${m}/search?q=${encodeURIComponent(query)}&format=json&language=es&safesearch=0`, {
        headers: { ...HEADERS, "Accept": "application/json" },
        signal: AbortSignal.timeout(7000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const out: Result[] = (d.results || []).slice(0, 10).map((x: any) => ({
        title: x.title || "", url: x.url || "", snippet: (x.content || "").slice(0, 280), source: "searx",
      })).filter((x: Result) => x.url.startsWith("http"));
      if (out.length) return out;
    } catch {}
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { query, recent } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query requerida", results: [] }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Si pidieron recencia y no hay año en la query, le agregamos el año actual
    const year = new Date().getFullYear();
    let q = query;
    if (recent && !/20\d{2}/.test(query)) q = `${query} ${year}`;

    // Lanzar engines en paralelo
    const [a, b, c, d] = await Promise.allSettled([
      searchBrave(q),
      searchDDG(q),
      searchStartpage(q),
      searchSearX(q),
    ]);

    const all: Result[] = [];
    const engines: string[] = [];
    if (a.status === "fulfilled" && a.value.length) { all.push(...a.value); engines.push(`brave(${a.value.length})`); }
    if (b.status === "fulfilled" && b.value.length) { all.push(...b.value); engines.push(`ddg(${b.value.length})`); }
    if (c.status === "fulfilled" && c.value.length) { all.push(...c.value); engines.push(`startpage(${c.value.length})`); }
    if (d.status === "fulfilled" && d.value.length) { all.push(...d.value); engines.push(`searx(${d.value.length})`); }

    const results = dedupe(all).slice(0, 15);

    return new Response(JSON.stringify({
      query: q, originalQuery: query, engines, results, count: results.length,
      fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error", results: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
