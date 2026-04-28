// Edge function: descarga un PDF/HTML desde una URL pública (gobierno paraguayo) y devuelve texto plano.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
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
      return new Response(JSON.stringify({ error: "Falta la URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return new Response(JSON.stringify({ error: "URL inválida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return new Response(JSON.stringify({ error: "Solo HTTP/HTTPS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": "PY-OS/1.0 (Paraguay Operating System; Asistente ciudadano)",
        "Accept": "application/pdf, text/html, */*",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `No se pudo descargar (HTTP ${res.status})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const contentType = res.headers.get("content-type")?.toLowerCase() || "";

    if (contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      const buf = await res.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf).subarray(0, 0)));
      // devolvemos los bytes en base64 para que el cliente los procese con pdfjs
      // (más confiable que hacer parsing de PDF en Deno)
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const b64 = btoa(binary);
      return new Response(JSON.stringify({ tipo: "pdf", base64: b64, fuente: url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await res.text();
    const texto = stripHtml(html);
    return new Response(JSON.stringify({ tipo: "texto", texto, fuente: url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("descargar-documento error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
