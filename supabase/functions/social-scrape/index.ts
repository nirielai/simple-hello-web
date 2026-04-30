// Social scraping avanzado: dada una persona/entidad/handle, busca posts recientes
// en X/Twitter (vía Nitter mirrors), Instagram, Facebook, TikTok, YouTube y LinkedIn.
// Usa múltiples mirrors públicos y fallback a búsqueda web.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HEADERS: HeadersInit = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
  "Accept-Language": "es-PY,es;q=0.9,en;q=0.7",
  "Accept-Encoding": "identity",
  "Cache-Control": "no-cache",
};

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

type SocialPost = {
  network: "x" | "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin" | "web";
  handle?: string;
  url: string;
  date?: string;
  text: string;
  source: string;
};

// ============= X / TWITTER (Nitter mirrors) =============
const NITTER_MIRRORS = [
  "https://nitter.net",
  "https://nitter.privacydev.net",
  "https://nitter.poast.org",
  "https://nitter.tiekoetter.com",
  "https://nitter.space",
  "https://xcancel.com",
];

async function scrapeNitter(handle: string, max = 10): Promise<SocialPost[]> {
  const h = handle.replace(/^@/, "");
  for (const mirror of NITTER_MIRRORS) {
    try {
      const r = await fetch(`${mirror}/${h}`, { headers: HEADERS, signal: AbortSignal.timeout(8000), redirect: "follow" });
      if (!r.ok) continue;
      const html = await r.text();
      if (!html.includes("timeline-item") && !html.includes("tweet-content")) continue;
      const posts: SocialPost[] = [];
      const items = html.split('class="timeline-item"').slice(1, max + 1);
      for (const it of items) {
        const block = it.slice(0, 6000);
        const linkM = block.match(/<a class="tweet-link" href="([^"]+)"/);
        const dateM = block.match(/<span class="tweet-date"[^>]*><a[^>]*title="([^"]+)"/);
        const textM = block.match(/<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        if (!linkM || !textM) continue;
        const path = linkM[1];
        posts.push({
          network: "x",
          handle: h,
          url: `https://x.com${path.replace(/#m$/, "")}`,
          date: dateM ? dateM[1] : undefined,
          text: strip(textM[1]).slice(0, 500),
          source: mirror,
        });
      }
      if (posts.length) return posts;
    } catch { /* siguiente mirror */ }
  }
  return [];
}

// ============= INSTAGRAM (página pública vía proxies / og tags) =============
async function scrapeInstagram(handle: string): Promise<SocialPost[]> {
  const h = handle.replace(/^@/, "");
  const proxies = [
    `https://www.instagram.com/${h}/`,
    `https://r.jina.ai/https://www.instagram.com/${h}/`, // proxy de lectura
    `https://r.jina.ai/https://www.picuki.com/profile/${h}`,
    `https://r.jina.ai/https://imginn.com/${h}/`,
  ];
  for (const url of proxies) {
    try {
      const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000), redirect: "follow" });
      if (!r.ok) continue;
      const body = await r.text();
      // Picuki / imginn / Jina-rendered páginas listan posts
      const posts: SocialPost[] = [];

      // Patrón Jina (markdown): bloques con links a /p/<code>
      const linkRe = /https?:\/\/(?:www\.)?instagram\.com\/p\/([A-Za-z0-9_-]+)/g;
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(body)) !== null && posts.length < 8) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        // Buscar texto cercano
        const idx = m.index;
        const ctx = body.slice(Math.max(0, idx - 400), idx + 400);
        const cleaned = strip(ctx).slice(0, 400);
        posts.push({
          network: "instagram",
          handle: h,
          url: `https://www.instagram.com/p/${m[1]}/`,
          text: cleaned,
          source: url.includes("jina") ? "jina-proxy" : (url.includes("picuki") ? "picuki" : (url.includes("imginn") ? "imginn" : "instagram")),
        });
      }

      // Bio / og:description del perfil
      const bioM = body.match(/<meta property="og:description" content="([^"]+)"/);
      if (bioM && posts.length === 0) {
        posts.push({
          network: "instagram",
          handle: h,
          url: `https://www.instagram.com/${h}/`,
          text: strip(bioM[1]).slice(0, 500),
          source: "og-meta",
        });
      }

      if (posts.length) return posts;
    } catch { /* sig */ }
  }
  return [];
}

// ============= FACEBOOK (vía mbasic / proxy) =============
async function scrapeFacebook(handle: string): Promise<SocialPost[]> {
  const h = handle.replace(/^@/, "").replace(/^https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com\//, "").replace(/\/$/, "");
  const urls = [
    `https://r.jina.ai/https://www.facebook.com/${h}`,
    `https://r.jina.ai/https://mbasic.facebook.com/${h}`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const body = await r.text();
      const posts: SocialPost[] = [];
      // Capturar fragmentos relevantes de texto público
      const blocks = body.split(/\n{2,}/).filter((b) => b.length > 60 && b.length < 1200).slice(0, 6);
      for (const b of blocks) {
        if (!/[a-záéíóúñ]/i.test(b)) continue;
        posts.push({
          network: "facebook",
          handle: h,
          url: `https://www.facebook.com/${h}`,
          text: strip(b).slice(0, 500),
          source: "jina-proxy",
        });
      }
      if (posts.length) return posts;
    } catch {}
  }
  return [];
}

// ============= TIKTOK =============
async function scrapeTikTok(handle: string): Promise<SocialPost[]> {
  const h = handle.replace(/^@/, "");
  const url = `https://r.jina.ai/https://www.tiktok.com/@${h}`;
  try {
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const body = await r.text();
    const posts: SocialPost[] = [];
    const linkRe = /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(body)) !== null && posts.length < 6) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const ctx = strip(body.slice(Math.max(0, m.index - 300), m.index + 300));
      posts.push({
        network: "tiktok", handle: h,
        url: `https://www.tiktok.com/@${h}/video/${m[1]}`,
        text: ctx.slice(0, 400),
        source: "jina-proxy",
      });
    }
    return posts;
  } catch { return []; }
}

// ============= YOUTUBE =============
async function scrapeYouTube(handle: string): Promise<SocialPost[]> {
  const h = handle.replace(/^@/, "");
  const url = `https://r.jina.ai/https://www.youtube.com/@${h}/videos`;
  try {
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const body = await r.text();
    const posts: SocialPost[] = [];
    const linkRe = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(body)) !== null && posts.length < 6) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const ctx = strip(body.slice(Math.max(0, m.index - 300), m.index + 300));
      posts.push({
        network: "youtube", handle: h,
        url: `https://www.youtube.com/watch?v=${m[1]}`,
        text: ctx.slice(0, 400),
        source: "jina-proxy",
      });
    }
    return posts;
  } catch { return []; }
}

// ============= LINKEDIN (limitado, solo perfil público) =============
async function scrapeLinkedIn(handleOrSlug: string): Promise<SocialPost[]> {
  const h = handleOrSlug.replace(/^@/, "");
  const url = `https://r.jina.ai/https://www.linkedin.com/in/${h}`;
  try {
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const body = await r.text();
    const txt = strip(body).slice(0, 1500);
    if (!txt || txt.length < 80) return [];
    return [{
      network: "linkedin", handle: h,
      url: `https://www.linkedin.com/in/${h}`,
      text: txt,
      source: "jina-proxy",
    }];
  } catch { return []; }
}

// ============= GUESS HANDLES vía búsqueda web =============
async function discoverHandles(query: string, supaUrl: string, supaKey: string): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = { x: [], instagram: [], facebook: [], tiktok: [], youtube: [] };
  const q = `${query} (site:x.com OR site:twitter.com OR site:instagram.com OR site:facebook.com OR site:tiktok.com OR site:youtube.com)`;
  try {
    const r = await fetch(`${supaUrl}/functions/v1/web-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supaKey}` },
      body: JSON.stringify({ query: q }),
    });
    const d = await r.json();
    for (const res of d.results || []) {
      const u: string = res.url || "";
      let m: RegExpMatchArray | null;
      if ((m = u.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{2,30})(?:\/|$|\?)/i)) && !["i", "search", "home", "explore", "intent"].includes(m[1].toLowerCase())) out.x.push(m[1]);
      else if ((m = u.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})(?:\/|$|\?)/i)) && !["p", "reel", "explore", "accounts"].includes(m[1].toLowerCase())) out.instagram.push(m[1]);
      else if ((m = u.match(/facebook\.com\/([A-Za-z0-9.]{2,80})(?:\/|$|\?)/i)) && !["pages", "profile.php", "watch", "groups"].includes(m[1].toLowerCase())) out.facebook.push(m[1]);
      else if ((m = u.match(/tiktok\.com\/@([A-Za-z0-9_.]{2,30})/i))) out.tiktok.push(m[1]);
      else if ((m = u.match(/youtube\.com\/@([A-Za-z0-9_.\-]{2,40})/i))) out.youtube.push(m[1]);
    }
    // Dedup y top 2
    for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 2);
  } catch {}
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { query, handles, networks } = body as {
      query?: string;
      handles?: { x?: string; instagram?: string; facebook?: string; tiktok?: string; youtube?: string; linkedin?: string };
      networks?: string[];
    };

    const wantedNets = new Set((networks || ["x", "instagram", "facebook", "tiktok", "youtube"]).map((s) => s.toLowerCase()));
    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPA_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    let resolved = handles || {};
    let discovered: Record<string, string[]> = {};

    // Si no pasaron handles → descubrir desde la query
    if ((!handles || Object.keys(handles).length === 0) && query) {
      discovered = await discoverHandles(query, SUPA_URL, SUPA_KEY);
      resolved = {
        x: discovered.x?.[0],
        instagram: discovered.instagram?.[0],
        facebook: discovered.facebook?.[0],
        tiktok: discovered.tiktok?.[0],
        youtube: discovered.youtube?.[0],
      };
    }

    // Ejecutar scraps en paralelo
    const tasks: Promise<{ net: string; posts: SocialPost[] }>[] = [];
    if (wantedNets.has("x") && resolved.x) tasks.push(scrapeNitter(resolved.x).then((p) => ({ net: "x", posts: p })));
    if (wantedNets.has("instagram") && resolved.instagram) tasks.push(scrapeInstagram(resolved.instagram).then((p) => ({ net: "instagram", posts: p })));
    if (wantedNets.has("facebook") && resolved.facebook) tasks.push(scrapeFacebook(resolved.facebook).then((p) => ({ net: "facebook", posts: p })));
    if (wantedNets.has("tiktok") && resolved.tiktok) tasks.push(scrapeTikTok(resolved.tiktok).then((p) => ({ net: "tiktok", posts: p })));
    if (wantedNets.has("youtube") && resolved.youtube) tasks.push(scrapeYouTube(resolved.youtube).then((p) => ({ net: "youtube", posts: p })));
    if (wantedNets.has("linkedin") && resolved.linkedin) tasks.push(scrapeLinkedIn(resolved.linkedin).then((p) => ({ net: "linkedin", posts: p })));

    const settled = await Promise.allSettled(tasks);
    const allPosts: SocialPost[] = [];
    const summary: Record<string, number> = {};
    for (const s of settled) {
      if (s.status === "fulfilled") {
        allPosts.push(...s.value.posts);
        summary[s.value.net] = s.value.posts.length;
      }
    }

    // Fallback: si no se obtuvo nada → búsqueda web global con queries específicas por red
    if (allPosts.length === 0 && query) {
      const fallbackQueries = [
        `site:x.com ${query}`,
        `site:instagram.com ${query}`,
        `site:facebook.com ${query}`,
        `${query} última publicación 2026`,
      ];
      for (const fq of fallbackQueries) {
        try {
          const r = await fetch(`${SUPA_URL}/functions/v1/web-search`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPA_KEY}` },
            body: JSON.stringify({ query: fq }),
          });
          const d = await r.json();
          for (const res of (d.results || []).slice(0, 4)) {
            const u: string = res.url || "";
            let net: SocialPost["network"] = "web";
            if (/x\.com|twitter\.com/.test(u)) net = "x";
            else if (/instagram\.com/.test(u)) net = "instagram";
            else if (/facebook\.com/.test(u)) net = "facebook";
            else if (/tiktok\.com/.test(u)) net = "tiktok";
            allPosts.push({
              network: net, url: u,
              text: `${res.title || ""}${res.snippet ? " — " + res.snippet : ""}`.slice(0, 500),
              source: "web-search-fallback",
            });
          }
        } catch {}
      }
    }

    return new Response(JSON.stringify({
      query, resolved, discovered, summary,
      posts: allPosts.slice(0, 30),
      count: allPosts.length,
      fetchedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("social-scrape error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error", posts: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
