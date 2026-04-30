// Scraping avanzado: HTML + PDF + JSON-LD + OG tags + fallback Jina Reader.
// Detecta redes sociales y enriquece la extracción.
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@1.6.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
  "Accept-Language": "es-PY,es;q=0.9,en;q=0.5",
  "Accept-Encoding": "identity",
};

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

function extractMeta(html: string) {
  const meta: Record<string, string> = {};
  const re = /<meta[^>]+(?:property|name)="([^"]+)"[^>]+content="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) meta[m[1].toLowerCase()] = m[2];
  return meta;
}

function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try { out.push(JSON.parse(m[1].trim())); } catch {}
  }
  return out;
}

function extractMain(html: string): string {
  // Intenta capturar <article>, <main> o <div id="content">
  const m = html.match(/<article[\s\S]*?<\/article>/i)
    || html.match(/<main[\s\S]*?<\/main>/i)
    || html.match(/<div[^>]+id="content"[\s\S]*?<\/div>/i);
  return m ? strip(m[0]) : strip(html);
}

function isSocial(url: string): { net: string; handle?: string } | null {
  let m: RegExpMatchArray | null;
  if ((m = url.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{2,30})/i))) return { net: "x", handle: m[1] };
  if ((m = url.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i))) return { net: "instagram", handle: m[1] };
  if ((m = url.match(/facebook\.com\/([A-Za-z0-9.]{2,80})/i))) return { net: "facebook", handle: m[1] };
  if ((m = url.match(/tiktok\.com\/@([A-Za-z0-9_.]{2,30})/i))) return { net: "tiktok", handle: m[1] };
  if ((m = url.match(/youtube\.com\/@([A-Za-z0-9_.\-]{2,40})/i))) return { net: "youtube", handle: m[1] };
  return null;
}

async function fetchDirect(url: string) {
  return await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000), redirect: "follow" });
}

async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
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

    // Si es red social → delegar a social-scrape
    const social = isSocial(url);
    if (social && social.handle) {
      const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPA_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
      try {
        const r = await fetch(`${SUPA_URL}/functions/v1/social-scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPA_KEY}` },
          body: JSON.stringify({ handles: { [social.net]: social.handle }, networks: [social.net] }),
        });
        const d = await r.json();
        return new Response(JSON.stringify({
          url, contentType: "social", network: social.net, handle: social.handle,
          posts: d.posts || [], count: d.count || 0,
          fetchedAt: new Date().toISOString(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch { /* cae al flujo normal */ }
    }

    let r = await fetchDirect(url).catch(() => null);

    // Fallback Jina si bloqueado o lento
    if (!r || (!r.ok && (r.status === 403 || r.status === 401 || r.status === 429))) {
      const txt = await fetchViaJina(url);
      if (txt) {
        return new Response(JSON.stringify({
          url, contentType: "text/markdown", title: url,
          text: txt.slice(0, 12000), truncated: txt.length > 12000,
          via: "jina-reader", fetchedAt: new Date().toISOString(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (!r) {
      return new Response(JSON.stringify({ error: `No se pudo conectar a ${url}`, url }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${r.status} al obtener ${url}`, url, status: r.status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ct = r.headers.get("content-type") || "";

    // PDF
    if (ct.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      const buf = new Uint8Array(await r.arrayBuffer());
      try {
        const doc = await getDocumentProxy(buf);
        const { text, totalPages } = await extractText(doc, { mergePages: true });
        const merged = (Array.isArray(text) ? text.join("\n") : text).replace(/\s+/g, " ").trim();
        return new Response(JSON.stringify({
          url, contentType: "pdf", title: url.split("/").pop(),
          text: merged.slice(0, 12000), pages: totalPages,
          truncated: merged.length > 12000, fetchedAt: new Date().toISOString(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "PDF no procesable: " + (e instanceof Error ? e.message : "err"), url }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await r.text();
    const isHtml = ct.includes("html") || /<html/i.test(body.slice(0, 500));

    if (!isHtml) {
      return new Response(JSON.stringify({
        url, contentType: ct, title: "",
        text: body.slice(0, 12000), truncated: body.length > 12000,
        fetchedAt: new Date().toISOString(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const titleM = body.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleM ? titleM[1].trim() : "";
    const meta = extractMeta(body);
    const jsonld = extractJsonLd(body);
    const text = extractMain(body).slice(0, 12000);

    return new Response(JSON.stringify({
      url, contentType: ct, title,
      description: meta["og:description"] || meta["description"] || "",
      ogImage: meta["og:image"] || "",
      author: meta["author"] || meta["article:author"] || "",
      published: meta["article:published_time"] || meta["og:updated_time"] || "",
      jsonld: jsonld.slice(0, 3),
      text, truncated: text.length === 12000,
      fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error scraping" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
