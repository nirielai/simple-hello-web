// Análisis profundo de documento con Gemini Pro - streaming
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `Sos un auditor público paraguayo experto en contrataciones, decretos y contratos del Estado.
Analizás el documento y devolvés un INFORME en markdown con esta estructura EXACTA:

## Resumen ejecutivo
(2-3 frases sobre qué es y qué propone)

## Partes involucradas
(lista con bullets)

## Montos y plazos
(tabla o lista clara)

## Cláusulas inusuales o riesgosas
(qué te llama la atención y por qué)

## Indicadores de riesgo
- Adjudicación directa: sí/no
- Único oferente: sí/no
- Urgencia/emergencia: sí/no
- Adendas o ampliaciones: sí/no

## Semáforo final
**🟢 Verde / 🟡 Amarillo / 🔴 Rojo** — justificación en una línea.

Sé directo. Si faltan datos, decilo. NO inventes cifras.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { text, filename } = await req.json();
    if (!text) throw new Error("text requerido");
    const PY_OS = Deno.env.get("PY_OS");
    if (!PY_OS) throw new Error("PY_OS no configurado");

    const userMsg = `Documento: ${filename || "sin nombre"}\n\n--- TEXTO EXTRAÍDO ---\n${text.slice(0, 25000)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${PY_OS}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }],
        stream: true,
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Demasiadas consultas." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "Sin créditos PY-OS AI." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!response.ok) {
      console.error("audit-analyze gw error", response.status, await response.text());
      return new Response(JSON.stringify({ error: "Error del gateway IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
