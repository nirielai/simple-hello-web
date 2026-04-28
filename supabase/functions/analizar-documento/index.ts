// Edge function: análisis estructurado de documentos públicos paraguayos
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texto, fuente } = await req.json();
    if (!texto || typeof texto !== "string" || texto.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Texto del documento muy corto o vacío" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no está configurado");

    // Truncar texto muy largo
    const textoTruncado = texto.length > 60000 ? texto.slice(0, 60000) + "\n\n[...documento truncado...]" : texto;

    const tools = [{
      type: "function",
      function: {
        name: "registrar_analisis",
        description: "Registra el análisis estructurado del documento público paraguayo",
        parameters: {
          type: "object",
          properties: {
            tipo_documento: {
              type: "string",
              description: "Tipo: licitación, decreto, ley, contrato, resolución, etc.",
            },
            titulo: { type: "string", description: "Título o asunto del documento" },
            resumen_ejecutivo: {
              type: "string",
              description: "Resumen claro en 3-5 oraciones, lenguaje sencillo en español.",
            },
            partes_involucradas: {
              type: "array",
              items: { type: "string" },
              description: "Entidades, personas o empresas involucradas",
            },
            montos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  concepto: { type: "string" },
                  valor: { type: "string", description: "Monto con moneda, ej: 'Gs. 1.500.000.000'" },
                },
                required: ["concepto", "valor"],
                additionalProperties: false,
              },
            },
            plazos: {
              type: "array",
              items: { type: "string" },
              description: "Fechas y plazos relevantes",
            },
            hallazgos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  severidad: { type: "string", enum: ["info", "advertencia", "alerta"] },
                  titulo: { type: "string" },
                  descripcion: { type: "string" },
                },
                required: ["severidad", "titulo", "descripcion"],
                additionalProperties: false,
              },
              description: "Posibles sobrecostos, irregularidades, cláusulas inusuales o puntos a verificar",
            },
            semaforo: {
              type: "string",
              enum: ["verde", "amarillo", "rojo"],
              description: "verde = sin alertas, amarillo = puntos a revisar, rojo = irregularidades serias",
            },
            recomendacion: {
              type: "string",
              description: "Recomendación clara para el ciudadano en 1-2 oraciones",
            },
          },
          required: [
            "tipo_documento", "titulo", "resumen_ejecutivo", "partes_involucradas",
            "montos", "plazos", "hallazgos", "semaforo", "recomendacion",
          ],
          additionalProperties: false,
        },
      },
    }];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `Sos PY-OS, auditor experto en documentos públicos paraguayos (DNCP, Gaceta Oficial, Contraloría).
Tu trabajo es desglosar el documento en lenguaje simple y detectar:
- Sobrecostos sospechosos (precios fuera de mercado paraguayo)
- Cláusulas que favorecen indebidamente a un proveedor
- Plazos atípicamente cortos o sin justificación
- Faltas de transparencia o información incompleta
- Conflictos de interés evidentes

Sé riguroso pero justo. Si todo parece normal, ponelo en verde. Reservá rojo solo para irregularidades claras.
Respondé SIEMPRE en español neutro y claro.`,
          },
          {
            role: "user",
            content: `Fuente: ${fuente || "documento subido"}\n\nDOCUMENTO:\n${textoTruncado}`,
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "registrar_analisis" } },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("La IA no devolvió análisis estructurado");
    }
    const analisis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ analisis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analizar-documento error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
