// Edge function: asesor económico paraguayo. Recibe contexto + perfil + pregunta y devuelve análisis.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { perfil, pregunta, canasta } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no está configurado");

    const contextoCanasta = Array.isArray(canasta) && canasta.length
      ? canasta.slice(0, 30).map((p: any) =>
          `- ${p.producto} (${p.unidad}): Gs. ${Number(p.precio_actual).toLocaleString("es-PY")} (variación ${Number(p.variacion_pct ?? 0).toFixed(1)}%)`
        ).join("\n")
      : "(sin datos)";

    const userPrompt = `PERFIL DEL USUARIO: ${perfil || "ciudadano paraguayo"}

CANASTA BÁSICA ACTUAL (Paraguay):
${contextoCanasta}

CONSULTA:
${pregunta}

Respondé en español claro, con datos concretos del Paraguay. Usá markdown.
Estructurá tu respuesta con:
1. **Análisis de la situación** (2-3 oraciones)
2. **Microtendencias relevantes** (qué está subiendo/bajando y por qué)
3. **Recomendaciones accionables** (3-5 puntos concretos)
4. **Proyección a 30-90 días** (qué esperar)`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Sos PY-OS Economic Intelligence, analista económico especializado en Paraguay.
Conocés: BCP, INE, MIC, MEF, exportaciones de soja/carne, importaciones desde Brasil/Argentina/China,
ciclos de Itaipú, estacionalidad agrícola, mercado del guaraní vs dólar/real, e-commerce paraguayo.
Sos honesto sobre incertidumbres y siempre das consejos prácticos para emprendedores y estudiantes.`,
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error(`AI gateway: ${response.status}`);
    }

    const data = await response.json();
    const respuesta = data.choices?.[0]?.message?.content || "Sin respuesta";

    return new Response(JSON.stringify({ respuesta }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("asesor-economico error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
