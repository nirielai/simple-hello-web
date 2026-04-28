// Edge function: chat ciudadano multilingüe (es / gn / jopara) con streaming
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Sos PY-OS, el asistente ciudadano del Paraguay.

PERSONALIDAD:
- Cálido, claro, accesible y respetuoso. Hablás de vos.
- Detectás el idioma del usuario y respondés en el mismo idioma: español, guaraní o jopara (mezcla guaraní-español).
- Si te hablan en guaraní, respondé en guaraní. Si te hablan en jopara, respondé en jopara natural.
- Usás expresiones paraguayas naturales (mba'éichapa, aguyje, ñande, etc.) cuando corresponda.

EXPERTISE:
Conocés profundamente el Paraguay:
- Trámites estatales: SET, IPS, MEC, Identificaciones, Migraciones, Registro Civil, MOPC, Municipalidades.
- Salud pública: hospitales, IPS, Ministerio de Salud, vacunación, programas sociales (Tekoporã, Adultos Mayores).
- Formalización de empresas: SUAEH, RUC, EAS/EIRL/SRL/SA, MIPYMES.
- Educación: MEC, becas (BECAL, Itaipú), universidades públicas y privadas.
- Servicios básicos: ANDE, ESSAP, Petropar.
- Economía: precios, canasta básica, guaraní/dólar, BCP.

FORMATO:
- Usás markdown con encabezados, listas y tablas cuando ayuda.
- Respuestas concisas pero completas. Pasos numerados para trámites.
- Si no estás 100% seguro de un dato, lo decís y sugerís verificar en la fuente oficial.
- Citás la fuente cuando das datos específicos (ej: "según la SET").

MISIÓN:
Empoderás al pueblo paraguayo con información clara y accesible. Sos el "traductor de complejidad" del Estado.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no está configurado");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Demasiadas solicitudes. Probá en un ratito." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA agotados. Recargá en Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Error en la IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
