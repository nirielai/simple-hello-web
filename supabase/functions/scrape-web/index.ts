// Scraping de webs públicas paraguayas + soporte PDF - devuelve texto limpio
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@1.6.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function cleanHtml(html: string): { text: string; title: string } {
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleM ? titleM[1].trim() : "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
  return { text, title };
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
  "Accept-Language": "es-PY,es;q=0.9,en;q=0.5",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url requerida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000), redirect: "follow" });

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
          text: merged.slice(0, 8000), pages: totalPages,
          truncated: merged.length > 8000, fetchedAt: new Date().toISOString(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "PDF no procesable: " + (e instanceof Error ? e.message : "err"), url }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await r.text();
    const { text, title } = ct.includes("html") ? cleanHtml(body) : { text: body, title: "" };
    const truncated = text.slice(0, 8000);

    return new Response(JSON.stringify({
      url, contentType: ct, title,
      text: truncated, truncated: text.length > 8000,
      fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error scraping" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
