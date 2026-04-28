// Asistente ciudadano paraguayo - chat streaming con tool-calling para scraping web
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Sos PY-OS, un asistente soberano paraguayo. Respondés en el idioma del usuario: español, guaraní o jopara (mezcla).

Conocés a fondo:
- Trámites del IPS (jubilación, aportes, atención médica)
- SET (impuestos: IRP, IVA, RUC, formalización)
- MEC (becas, títulos, escalafón)
- Identificaciones (cédula, pasaporte, antecedentes)
- Formalización de empresas (SAS, SRL, Unipersonal)
- Salud pública (MSP y BS, hospitales)
- Vida diaria en Paraguay

Reglas:
- Sé concreto, paso a paso, con costos y plazos cuando los conozcas.
- Si necesitás info actualizada (precios, requisitos, horarios), USÁ la herramienta web_search con una URL .gov.py o sitio oficial. NO inventes datos.
- Cuando uses guaraní, mantenelo natural (mba'éichapa, oĩporã, etc.).
- Markdown para listas y pasos. Sin emojis excesivos.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurado");

    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Descarga y limpia el contenido de una URL pública paraguaya (.gov.py o medios). Úsalo cuando necesites datos actualizados, requisitos oficiales, precios o noticias.",
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
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
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
