// 20-agent team: each agent speaks visibly before the Director delivers the final answer
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Agent = { name: string; emoji: string; role: string; system: string; tools?: boolean };

const AGENTS_20: Agent[] = [
  { name: "Recepcionista", emoji: "🎯", role: "intake", system: "Sos el recepcionista. Leé la consulta, identificá la intención exacta (tema, país, entidad), y delegá al equipo. Máx 2 líneas." },
  { name: "Buscador Web", emoji: "🔍", role: "search", system: "Buscás info en la web con web_search. Hacé 1-3 búsquedas relevantes. Devolvé URLs y datos clave encontrados. Máx 5 viñetas.", tools: true },
  { name: "Analista", emoji: "📊", role: "analysis", system: "Analizás los datos recolectados. Identificás patrones, contradicciones, datos faltantes. Si falta algo crítico escribí 'BUSCAR: <query>'. Máx 5 líneas." },
  { name: "Verificador", emoji: "✅", role: "verify", system: "Verificás las fuentes citadas. ¿Son oficiales? ¿Están vigentes? ¿Hay sesgo? Marcá lo que no se pudo verificar. Máx 3 líneas." },
  { name: "Economista", emoji: "💰", role: "economics", system: "Especialista en economía paraguaya. Analizás implicaciones económicas: costos, presupuesto, inflación, tipo de cambio. Solo si es relevante. Máx 4 líneas." },
  { name: "Político", emoji: "🏛️", role: "politics", system: "Especialista en política paraguaya. Contexto político si es relevante: partidos, poder, instituciones. Solo opiná si la consulta lo amerita. Máx 3 líneas." },
  { name: "Social", emoji: "👥", role: "social", system: "Especialista en temas sociales. Impacto social, desigualdad, acceso a servicios. Solo si aplica. Máx 3 líneas." },
  { name: "Legal", emoji: "⚖️", role: "legal", system: "Especialista en leyes paraguayas. Citá artículos, leyes, decretos relevantes. Si no aplica, decí 'no relevante'. Máx 4 líneas." },
  { name: "Estadístico", emoji: "📈", role: "stats", system: "Manejás estadísticas y datos numéricos. Calculá, contextualizá cifras. Si no hay datos numéricos relevantes, decí 'sin datos estadísticos relevantes'. Máx 3 líneas." },
  { name: "Historiador", emoji: "📜", role: "history", system: "Dás contexto histórico si es relevante. Antecedentes, precedentes. Solo si aporta. Máx 3 líneas." },
  { name: "Periodista", emoji: "📰", role: "news", system: "Buscás noticias recientes relacionadas con web_search. Usá queries con fecha reciente. Devolvé titulares y links. Máx 4 viñetas.", tools: true },
  { name: "Crítico", emoji: "🧐", role: "critic", system: "Cuestionás la información recolectada. ¿Hay sesgos? ¿Datos desactualizados? ¿Conclusiones prematuras? Señalá debilidades. Máx 4 líneas." },
  { name: "Social Media", emoji: "📱", role: "socmedia", system: "Monitoreás redes sociales de entidades oficiales. Buscás con web_search posts recientes en Twitter/X de cuentas oficiales .gov.py. Máx 3 viñetas.", tools: true },
  { name: "Gov Monitor", emoji: "🏢", role: "govmon", system: "Monitoreás sitios oficiales del gobierno. Usás fetch_url en sitios .gov.py para verificar información. Máx 3 viñetas.", tools: true },
  { name: "Fact Checker", emoji: "🔬", role: "factcheck", system: "Verificás hechos específicos contrastando múltiples fuentes. Marcá cada hecho como VERIFICADO, NO VERIFICADO o PARCIAL. Máx 4 líneas." },
  { name: "Sintetizador", emoji: "🔗", role: "synthesis", system: "Unís toda la información del equipo en un resumen coherente y estructurado. Identificás los puntos clave y las conclusiones principales. Máx 8 líneas." },
  { name: "Redactor", emoji: "✍️", role: "writer", system: "Redactás la respuesta final clara, en español paraguayo. Markdown limpio con secciones, pasos accionables si aplica, links. Sin emojis decorativos." },
  { name: "Corrector", emoji: "📝", role: "corrector", system: "Corregís errores de la redacción: datos incorrectos, inconsistencias, gramática. Si todo está bien, decí 'aprobado sin cambios'. Máx 3 líneas." },
  { name: "Fuentes", emoji: "📚", role: "sources", system: "Citás TODAS las fuentes usadas por el equipo con URLs completas. Formato: lista con nombre de fuente y URL. Si no hay fuentes verificables, advertí." },
  { name: "Director", emoji: "👔", role: "director", system: "Sos el Director. Revisás TODO el trabajo del equipo. Aprobás o pedís correcciones. Luego entregás la RESPUESTA FINAL completa al usuario integrando: la redacción del Redactor + correcciones del Corrector + fuentes. Markdown profesional." },
];

// Teams select which of the 20 agents are relevant
const TEAM_AGENTS: Record<string, string[]> = {
  asistente: ["Recepcionista", "Buscador Web", "Analista", "Verificador", "Legal", "Social", "Gov Monitor", "Fact Checker", "Sintetizador", "Redactor", "Corrector", "Fuentes", "Director"],
  auditor: ["Recepcionista", "Buscador Web", "Analista", "Verificador", "Economista", "Legal", "Estadístico", "Periodista", "Crítico", "Gov Monitor", "Fact Checker", "Sintetizador", "Redactor", "Corrector", "Fuentes", "Director"],
  economia: ["Recepcionista", "Buscador Web", "Analista", "Economista", "Estadístico", "Periodista", "Crítico", "Social Media", "Gov Monitor", "Fact Checker", "Sintetizador", "Redactor", "Corrector", "Fuentes", "Director"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, team = "asistente", memory = "" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurado");

    const teamNames = TEAM_AGENTS[team] || TEAM_AGENTS.asistente;
    const agents = teamNames.map((n) => AGENTS_20.find((a) => a.name === n)!).filter(Boolean);
    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPA_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const emit = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        async function callLLM(systemPrompt: string, history: any[], useTools = false) {
          const tools = useTools ? [
            { type: "function", function: { name: "web_search", description: "Buscar en la web.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
            { type: "function", function: { name: "fetch_url", description: "Leer contenido de una URL.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
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
            const isLast = ag.name === "Director";
            const prev = transcript.map((t) => `[${t.agent}]: ${t.output}`).join("\n\n");
            emit({ type: "agent_start", agent: `${ag.emoji} ${ag.name}`, role: ag.role, message: `${ag.name} analizando…` });
            await new Promise((r) => setTimeout(r, 80));

            const history = [
              { role: "user", content: `Consulta del usuario:\n${userQuery}\n\n${prev ? `Trabajo del equipo hasta ahora:\n${prev}\n\n${researchData ? `Datos investigados:\n${researchData.slice(0, 6000)}\n\n` : ""}` : ""}Tu rol: ${ag.name} (${ag.role}). Respondé SOLO tu parte, máx lo indicado en tu instrucción.` },
            ];

            if (isLast) {
              if (i > 0) emit({ type: "agent_handoff", from: `${agents[i - 1].emoji} ${agents[i - 1].name}`, to: `${ag.emoji} ${ag.name}`, message: "Entregando al Director para respuesta final…" });
              const finalText = await callLLMStream(ag.system, history);
              transcript.push({ agent: ag.name, output: finalText });
            } else {
              if (i > 0) emit({ type: "agent_handoff", from: `${agents[i - 1].emoji} ${agents[i - 1].name}`, to: `${ag.emoji} ${ag.name}`, message: `Pasando a ${ag.name}…` });

              let resp = await callLLM(ag.system, history, !!ag.tools);
              let rounds = 0;
              while (rounds < 2 && resp.choices?.[0]?.message?.tool_calls?.length) {
                const msg = resp.choices[0].message;
                const toolMsgs: any[] = [];
                for (const tc of msg.tool_calls) {
                  let parsed: any = {}; try { parsed = JSON.parse(tc.function.arguments); } catch {}
                  const { result } = await runTool(`${ag.emoji} ${ag.name}`, tc.function.name, parsed);
                  researchData += `\n[${tc.function.name}] ${tc.function.arguments}\n${result.slice(0, 1500)}\n`;
                  toolMsgs.push({ role: "tool", tool_call_id: tc.id, content: result });
                }
                resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: "google/gemini-3-flash-preview",
                    messages: [{ role: "system", content: ag.system }, ...history, msg, ...toolMsgs],
                  }),
                }).then((r) => r.json());
                rounds++;
              }
              const out = resp.choices?.[0]?.message?.content || "(sin aporte)";
              emit({ type: "agent_thought", agent: `${ag.emoji} ${ag.name}`, text: out });
              transcript.push({ agent: ag.name, output: out });

              // Extra search if analyst/critic requests it
              const m = out.match(/BUSCAR:\s*(.+)/i);
              if (m && (ag.role === "analysis" || ag.role === "critic")) {
                const searcher = agents.find((a) => a.tools) || agents[1];
                emit({ type: "agent_handoff", from: `${ag.emoji} ${ag.name}`, to: `${searcher.emoji} ${searcher.name}`, message: `Búsqueda extra: ${m[1].slice(0, 80)}` });
                const { result } = await runTool(`${searcher.emoji} ${searcher.name}`, "web_search", { query: m[1] });
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
