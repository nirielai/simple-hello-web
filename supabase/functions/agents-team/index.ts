// Equipo multi-agente: orquesta sub-bots con roles específicos y emite SSE
// con cada paso ("pensamiento", "habla con X", "busca", "lee", "redacta").
//
// Eventos SSE emitidos (cada uno como `data: {json}\n\n`):
//   { type: "agent_start", agent, role, message }
//   { type: "agent_thought", agent, text }
//   { type: "agent_handoff", from, to, message }
//   { type: "tool_call", agent, tool, input, summary }
//   { type: "tool_result", agent, tool, summary }
//   { type: "delta", text }              -> texto final token a token
//   { type: "done" }
//   { type: "error", error }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEAMS: Record<string, { name: string; role: string; system: string }[]> = {
  asistente: [
    { name: "Recepcionista", role: "intake", system: "Sos el recepcionista del equipo PY-OS. Tu trabajo: leer la consulta del ciudadano, identificar la intención (trámite, IPS, SET, MEC, formalización…), aclarar ambigüedades en una sola línea y delegar al investigador. Respondé MUY corto: 1-2 líneas máximo." },
    { name: "Investigador", role: "research", system: "Sos el investigador. Llamás a web_search y fetch_url sobre sitios .gov.py paraguayos para juntar datos vigentes. Hacé 1-3 llamadas a herramientas. Resumí lo encontrado en 3-5 viñetas con links." },
    { name: "Analista", role: "analysis", system: "Sos analista crítico. Recibís lo del investigador, contrastás fuentes, detectás contradicciones o info faltante. Si falta algo crítico, pedile al investigador una búsqueda más (formato: 'BUSCAR: <query>'). Si está completo, pasá al redactor." },
    { name: "Redactor", role: "writer", system: "Sos el redactor final. Devolvés la respuesta al ciudadano en español/guaraní claro, con pasos accionables, costos en ₲, plazos en días y links markdown clicables. Markdown limpio, sin emojis decorativos." },
  ],
  auditor: [
    { name: "Recepcionista", role: "intake", system: "Recibís el pedido de auditoría (URL de PDF, contrato, decreto o búsqueda en DNCP). Identificás qué documento hay que leer y delegás. 1-2 líneas." },
    { name: "Buscador", role: "search", system: "Si no hay URL directa, usás web_search con 'site:contrataciones.gov.py' o 'site:gov.py' para encontrar el documento. Devolvés URL más confiable." },
    { name: "Lector", role: "reader", system: "Usás fetch_url para descargar el PDF o HTML completo. Extraés: montos, partes, plazos, fechas, adjudicatarios. No interpretás aún." },
    { name: "Auditor", role: "audit", system: "Sos auditor crítico. Detectás: adjudicaciones directas sin justificación, montos inflados vs mercado, plazos imposibles, conflicto de interés, falta de competencia. Marcás riesgos como 🟢 bajo / 🟡 medio / 🔴 alto." },
    { name: "Redactor", role: "writer", system: "Redactás el informe de auditoría en español con: resumen ejecutivo, datos clave (montos, partes, plazos), riesgos detectados con nivel, recomendación final. Markdown con links a la fuente original." },
  ],
  economia: [
    { name: "Recepcionista", role: "intake", system: "Recibís la consulta económica (cotización, predicción, asesoría). 1-2 líneas identificando qué se pide." },
    { name: "DataBot", role: "data", system: "Recolectás datos en vivo: usás fetch_url sobre dolar.melizeche.com, exchangerate.host o web_search para noticias económicas paraguayas recientes (BCP, ABC Economía, MIC)." },
    { name: "Analista", role: "analysis", system: "Analizás los datos con pensamiento crítico: tendencia, volatilidad, contexto regional (Brasil, Argentina), factores macro. Si faltan datos, pedí al DataBot ('BUSCAR: <query>')." },
    { name: "Asesor", role: "advisor", system: "Asesor económico final. Das recomendación accionable según el perfil del usuario (estudiante, comerciante, productor, asalariado). Predicción 3-7 días con rango y nivel de confianza. Siempre advertí sobre incertidumbre. Markdown claro con números y links." },
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, team = "asistente", memory = "" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurado");

    const agents = TEAMS[team] || TEAMS.asistente;
    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPA_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const emit = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        async function callLLM(systemPrompt: string, history: any[], useTools = false) {
          const tools = useTools ? [
            {
              type: "function",
              function: {
                name: "web_search",
                description: "Buscar en la web (Brave/DuckDuckGo). Devuelve URLs y snippets.",
                parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
              },
            },
            {
              type: "function",
              function: {
                name: "fetch_url",
                description: "Descarga y limpia el contenido de una URL (HTML o PDF).",
                parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
              },
            },
          ] : undefined;

          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "system", content: systemPrompt + (memory ? `\n\nMemoria del usuario:\n${memory}` : "") }, ...history],
              tools,
            }),
          });
          if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
          return await r.json();
        }

        async function callLLMStream(systemPrompt: string, history: any[]) {
          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "system", content: systemPrompt + (memory ? `\n\nMemoria del usuario:\n${memory}` : "") }, ...history],
              stream: true,
            }),
          });
          if (!r.ok || !r.body) throw new Error(`LLM stream ${r.status}`);
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          let full = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, nl).replace(/\r$/, "");
              buf = buf.slice(nl + 1);
              if (!line.startsWith("data: ")) continue;
              const js = line.slice(6).trim();
              if (js === "[DONE]") return full;
              try {
                const p = JSON.parse(js);
                const c = p.choices?.[0]?.delta?.content;
                if (c) { full += c; emit({ type: "delta", text: c }); }
              } catch {}
            }
          }
          return full;
        }

        async function runTool(agentName: string, name: string, args: any): Promise<{ result: string; summary: string }> {
          const url = name === "web_search" ? `${SUPA_URL}/functions/v1/web-search` : `${SUPA_URL}/functions/v1/scrape-web`;
          const body = name === "web_search" ? { query: args.query } : { url: args.url };
          emit({ type: "tool_call", agent: agentName, tool: name, input: args, summary: name === "web_search" ? `Buscando: ${args.query}` : `Leyendo: ${args.url}` });
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPA_KEY}` },
            body: JSON.stringify(body),
          });
          const data = await r.json();
          let summary = "ok";
          if (name === "web_search") summary = data.results?.length ? `${data.results.length} resultados` : "sin resultados";
          else summary = data.error ? "error" : (data.contentType === "pdf" ? `PDF (${data.pages || "?"}p)` : "leído");
          emit({ type: "tool_result", agent: agentName, tool: name, summary });
          return { result: JSON.stringify(data).slice(0, 5000), summary };
        }

        try {
          const userQuery = messages[messages.length - 1]?.content || "";
          const transcript: { agent: string; output: string }[] = [];
          let researchData = "";

          for (let i = 0; i < agents.length; i++) {
            const ag = agents[i];
            const isLast = i === agents.length - 1;
            const prev = transcript.map((t) => `[${t.agent}]: ${t.output}`).join("\n\n");
            emit({ type: "agent_start", agent: ag.name, role: ag.role, message: `${ag.name} tomando el caso…` });
            await new Promise((r) => setTimeout(r, 100));

            const history = [
              { role: "user", content: `Consulta original del usuario:\n${userQuery}\n\n${prev ? `Trabajo previo del equipo:\n${prev}\n\n${researchData ? `Datos investigados:\n${researchData}\n\n` : ""}Tu rol como ${ag.name}: ${ag.role}.` : `Tu rol como ${ag.name}: ${ag.role}.`}` },
            ];

            const useTools = ag.role === "research" || ag.role === "search" || ag.role === "reader" || ag.role === "data";

            if (isLast) {
              // Streaming directo del redactor final
              if (i > 0) emit({ type: "agent_handoff", from: agents[i - 1].name, to: ag.name, message: `Pasando a ${ag.name} para respuesta final…` });
              const finalText = await callLLMStream(ag.system, history);
              transcript.push({ agent: ag.name, output: finalText });
            } else {
              if (i > 0) emit({ type: "agent_handoff", from: agents[i - 1].name, to: ag.name, message: `Pasando a ${ag.name}…` });
              // Permitir hasta 2 vueltas de tool calls
              let resp = await callLLM(ag.system, history, useTools);
              let rounds = 0;
              while (rounds < 2 && resp.choices?.[0]?.message?.tool_calls?.length) {
                const msg = resp.choices[0].message;
                const toolMsgs: any[] = [];
                for (const tc of msg.tool_calls) {
                  let parsed: any = {}; try { parsed = JSON.parse(tc.function.arguments); } catch {}
                  const { result } = await runTool(ag.name, tc.function.name, parsed);
                  researchData += `\n[${tc.function.name}] ${tc.function.arguments}\n${result.slice(0, 1500)}\n`;
                  toolMsgs.push({ role: "tool", tool_call_id: tc.id, content: result });
                }
                resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: "google/gemini-3-flash-preview",
                    messages: [
                      { role: "system", content: ag.system },
                      ...history,
                      msg,
                      ...toolMsgs,
                    ],
                    tools: useTools ? undefined : undefined,
                  }),
                }).then((r) => r.json());
                rounds++;
              }
              const out = resp.choices?.[0]?.message?.content || "(sin salida)";
              emit({ type: "agent_thought", agent: ag.name, text: out });
              transcript.push({ agent: ag.name, output: out });

              // Si el analista pide más búsqueda
              const m = out.match(/BUSCAR:\s*(.+)/i);
              if (m && ag.role === "analysis" && i < agents.length - 1) {
                emit({ type: "agent_handoff", from: ag.name, to: agents[1].name, message: `Necesita más datos: ${m[1].slice(0, 80)}` });
                const { result } = await runTool(agents[1].name, "web_search", { query: m[1] });
                researchData += `\n[búsqueda extra]\n${result.slice(0, 1500)}\n`;
              }
            }
          }

          emit({ type: "done" });
          controller.close();
        } catch (e: any) {
          console.error("agents-team error:", e);
          emit({ type: "error", error: e?.message || "error" });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
