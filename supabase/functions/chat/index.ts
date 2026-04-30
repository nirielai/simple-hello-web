// Asistente ciudadano paraguayo - chat streaming con tool-calling (web_search + fetch_url)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Sos PY-OS, un asistente soberano paraguayo con pensamiento crítico. Respondés en el idioma del usuario: español, guaraní o jopara (mezcla natural).

DOMINIO:
- IPS, SET (IRP, IVA, RUC), MEC, identificaciones, formalización (SAS, SRL, Unipersonal)
- DNCP (contrataciones públicas), MSP, MOPC, MTESS
- Vida diaria, derechos, trámites en Paraguay

PROCESO MENTAL OBLIGATORIO antes de responder:
1. ¿Qué pide realmente el usuario? (intención)
2. ¿Tengo datos suficientes en mi conocimiento o debo buscar/leer en línea?
3. Si necesito datos actualizados (precios, requisitos vigentes, horarios, contratos, noticias, leyes recientes) → SIEMPRE usá \`web_search\` primero, después \`fetch_url\` sobre la URL más confiable.
4. Después de leer, contrastá fuentes. Si una fuente contradice otra, aclará la duda.
5. Estructurá: respuesta clara → pasos accionables → links clicables.

REGLAS DURAS:
- NO inventes datos. Si no estás seguro, buscá. Si la búsqueda falla, decilo abiertamente.
- Preferí URLs \`.gov.py\` (ips, set, mec, identificaciones, dncp, mopc) y medios serios (ABC, Última Hora, La Nación, Hoy).
- SIEMPRE cita fuentes con links markdown clicables: \`[Texto descriptivo](https://url)\`. Mínimo 1 link cuando uses datos de la web.
- Cuando uses guaraní, que sea natural (no traducción literal).
- Markdown limpio, sin emojis decorativos. Negritas solo para términos clave.
- Sé concreto: costos en ₲, plazos en días, oficinas con dirección si aplica.
- Pensamiento crítico: si el usuario asume algo falso, corregilo amablemente con evidencia.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, memory } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurado");

    const sysContent = memory && typeof memory === "string" && memory.trim()
      ? `${SYSTEM_PROMPT}\n\nMEMORIA DEL USUARIO (de conversaciones previas, usala con criterio y no la repitas literalmente):\n${memory}`
      : SYSTEM_PROMPT;

    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Busca en la web (DuckDuckGo) y devuelve URLs y snippets relevantes. Usalo cuando no sepas qué URL específica abrir.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Consulta de búsqueda (preferí términos en español + 'site:gov.py' cuando aplique)" },
              reason: { type: "string", description: "Por qué buscás esto (visible al usuario)" },
            },
            required: ["query", "reason"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "fetch_url",
          description: "Descarga y limpia el contenido de una URL específica (HTML o PDF). Usalo después de web_search o cuando ya sabés la URL exacta.",
          parameters: {
            type: "object",
            properties: {
              url: { type: "string", description: "URL completa https://" },
              reason: { type: "string", description: "Por qué consultás esta URL (visible al usuario)" },
            },
            required: ["url", "reason"],
          },
        },
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        tools,
        stream: true,
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Demasiadas consultas, esperá un momento." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "Sin créditos en Lovable AI. Cargá créditos en Settings → Workspace → Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Error del gateway IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
