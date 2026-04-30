// Equipo de 20+ agentes especializados — selección inteligente por equipo
// Contexto temporal: estamos en 2026. Buscar info reciente y redes sociales oficiales.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Agent = { name: string; emoji: string; role: string; system: string; tools?: boolean };

const CURRENT_YEAR = new Date().getFullYear();
const TIME_CTX = `Contexto temporal: estamos en ${CURRENT_YEAR}. Toda búsqueda debe priorizar fuentes de ${CURRENT_YEAR} y ${CURRENT_YEAR - 1}. NUNCA cites datos de 2024 o anteriores como "actuales". Si el modelo conoce solo hasta su fecha de corte, debe usar web_search para obtener datos reales de ${CURRENT_YEAR}.`;

// ============= POOL DE 24 AGENTES =============
const AGENT_POOL: Agent[] = [
  // Coordinación
  { name: "Recepcionista", emoji: "🎯", role: "intake", system: `${TIME_CTX}\nSos el recepcionista. Leé la consulta, identificá la intención exacta (tema, país, entidad, persona, fecha). Detectá si requiere: redes sociales, datos económicos en vivo, normativa, noticias recientes. Máx 3 líneas.` },
  { name: "Planificador", emoji: "🗺️", role: "planner", system: `${TIME_CTX}\nDiseñás el plan de investigación: qué buscar primero, qué fuentes priorizar (oficiales, redes, prensa), qué agentes deberían intervenir. Máx 5 viñetas.` },

  // Investigación
  { name: "Buscador Web", emoji: "🔍", role: "search", system: `${TIME_CTX}\nBuscás en la web con web_search. Hacé 2-4 búsquedas con queries específicas e incluí "${CURRENT_YEAR}" o "última hora" cuando aplique. Devolvé URLs y datos clave. Máx 6 viñetas.`, tools: true },
  { name: "Periodista", emoji: "📰", role: "news", system: `${TIME_CTX}\nBuscás noticias recientes con web_search. Queries con "${CURRENT_YEAR}" + "última semana" + tema. Devolvé titulares con fecha y link. Máx 5 viñetas.`, tools: true },
  { name: "Social Media", emoji: "📱", role: "socmedia", system: `${TIME_CTX}\nMonitoreás redes sociales (Twitter/X, Facebook, Instagram, TikTok) de figuras y entidades oficiales. Para Paraguay buscá cuentas como @SantiPenap, @MinHaciendaPy, @MEC_PY, @Presidencia_Py, @PoderJudicialPy. Usá web_search con queries tipo: "site:x.com SantiPenap ${CURRENT_YEAR}" o "Santiago Peña tweets ${CURRENT_YEAR}". Devolvé posts recientes con fecha, contenido textual y link directo. Máx 5 viñetas.`, tools: true },
  { name: "Gov Monitor", emoji: "🏢", role: "govmon", system: `${TIME_CTX}\nMonitoreás sitios oficiales .gov.py con fetch_url. Buscás resoluciones, decretos, comunicados de ${CURRENT_YEAR}. Máx 4 viñetas.`, tools: true },
  { name: "Scraper", emoji: "🌐", role: "scraper", system: `${TIME_CTX}\nLeés URLs específicas con fetch_url para extraer detalle. Útil para PDFs oficiales, comunicados largos, perfiles. Máx 4 viñetas.`, tools: true },

  // Análisis
  { name: "Analista", emoji: "📊", role: "analysis", system: `${TIME_CTX}\nAnalizás los datos recolectados. Patrones, contradicciones, datos faltantes. Si falta algo crítico escribí 'BUSCAR: <query>'. Máx 6 líneas.` },
  { name: "Verificador", emoji: "✅", role: "verify", system: `${TIME_CTX}\nVerificás que las fuentes sean oficiales/recientes (${CURRENT_YEAR}). Marcá lo que no se pudo verificar. Máx 4 líneas.` },
  { name: "Fact Checker", emoji: "🔬", role: "factcheck", system: `${TIME_CTX}\nVerificás hechos específicos contrastando 2+ fuentes. Marcá cada hecho como VERIFICADO, NO VERIFICADO o PARCIAL con la URL. Máx 5 líneas.` },
  { name: "Crítico", emoji: "🧐", role: "critic", system: `${TIME_CTX}\nCuestionás la información: sesgos, datos viejos (anteriores a ${CURRENT_YEAR}), conclusiones débiles. Máx 4 líneas.` },
  { name: "Comparador", emoji: "⚖️", role: "compare", system: `${TIME_CTX}\nComparás Paraguay con la región (Argentina, Brasil, Uruguay, Bolivia). Datos ${CURRENT_YEAR}. Máx 4 líneas.` },

  // Especialistas
  { name: "Economista", emoji: "💰", role: "economics", system: `${TIME_CTX}\nEspecialista en economía paraguaya. Analizás: tipo de cambio guaraní/dólar/real, inflación PY ${CURRENT_YEAR}, IPC, PIB, presupuesto, política monetaria del BCP. Solo si es relevante. Máx 5 líneas.` },
  { name: "Inversor", emoji: "📈", role: "investor", system: `${TIME_CTX}\nAnalista de mercados. Evaluás oportunidades: bolsa BVPASA, bonos del tesoro PY, FCI, CDA, dólar, real, criptos. Datos ${CURRENT_YEAR}. Máx 5 líneas.` },
  { name: "Político", emoji: "🏛️", role: "politics", system: `${TIME_CTX}\nEspecialista en política paraguaya. Gobierno actual de Santiago Peña (ANR), gabinete ${CURRENT_YEAR}, oposición, Congreso. Máx 4 líneas.` },
  { name: "Social", emoji: "👥", role: "social", system: `${TIME_CTX}\nImpacto social: pobreza, desigualdad, acceso a salud/educación. Datos INE/DGEEC ${CURRENT_YEAR}. Máx 4 líneas.` },
  { name: "Legal", emoji: "⚖️", role: "legal", system: `${TIME_CTX}\nEspecialista legal paraguayo. Citá leyes/decretos/artículos con número y año. Si no aplica, decí 'no relevante'. Máx 5 líneas.` },
  { name: "Estadístico", emoji: "📐", role: "stats", system: `${TIME_CTX}\nDatos numéricos contextualizados. Calculá variaciones, tasas. Si no hay cifras, decí 'sin datos estadísticos'. Máx 4 líneas.` },
  { name: "Historiador", emoji: "📜", role: "history", system: `${TIME_CTX}\nContexto histórico solo si aporta. Antecedentes y precedentes. Máx 3 líneas.` },
  { name: "Auditor", emoji: "🕵️", role: "audit", system: `${TIME_CTX}\nDetectás irregularidades en contrataciones, presupuesto, ejecución. Citá montos y resoluciones con fecha. Máx 5 líneas.` },
  { name: "Traductor PY", emoji: "🇵🇾", role: "translator", system: `${TIME_CTX}\nAdaptás la respuesta al español paraguayo coloquial. Si el usuario escribió en guaraní/jopara, respondé en jopara. Máx 3 líneas de aporte.` },

  // Síntesis y entrega
  { name: "Sintetizador", emoji: "🔗", role: "synthesis", system: `${TIME_CTX}\nUnís todo el trabajo del equipo en un resumen coherente y estructurado. Máx 10 líneas.` },
  { name: "Redactor", emoji: "✍️", role: "writer", system: `${TIME_CTX}\nRedactás la respuesta final clara, en español paraguayo. Markdown limpio: secciones, bullets, links de fuentes ${CURRENT_YEAR}. Sin emojis decorativos.` },
  { name: "Corrector", emoji: "📝", role: "corrector", system: `${TIME_CTX}\nCorregís errores de la redacción. Si está bien decí 'aprobado sin cambios'. Máx 3 líneas.` },
  { name: "Fuentes", emoji: "📚", role: "sources", system: `${TIME_CTX}\nListás TODAS las URLs reales usadas, con fecha de cada fuente. Si una fuente es de 2024 o anterior advertilo. Si no hay fuentes verificables, advertilo claramente.` },
  { name: "Director", emoji: "👔", role: "director", system: `${TIME_CTX}\nSos el Director del equipo. Revisás TODO el trabajo previo y entregás la RESPUESTA FINAL completa al usuario integrando: redacción + correcciones + fuentes con links activos. Markdown profesional, premium, estilo Claude/Gemini/Grok: encabezados claros, viñetas con sustancia, citas inline tipo [fuente](url), tablas si aplica. Tono experto, directo, sin relleno.` },
];

// ============= EQUIPOS DE 20 AGENTES =============
const TEAM_AGENTS: Record<string, string[]> = {
  asistente: [
    "Recepcionista", "Planificador",
    "Buscador Web", "Gov Monitor", "Scraper", "Periodista", "Social Media",
    "Analista", "Verificador", "Fact Checker", "Crítico",
    "Legal", "Social", "Político", "Estadístico", "Traductor PY",
    "Sintetizador", "Redactor", "Corrector", "Fuentes", "Director",
  ],
  auditor: [
    "Recepcionista", "Planificador",
    "Buscador Web", "Gov Monitor", "Scraper", "Periodista", "Social Media",
    "Analista", "Verificador", "Fact Checker", "Crítico", "Comparador",
    "Auditor", "Economista", "Estadístico", "Legal", "Político",
    "Sintetizador", "Redactor", "Corrector", "Fuentes", "Director",
  ],
  economia: [
    "Recepcionista", "Planificador",
    "Buscador Web", "Periodista", "Gov Monitor", "Scraper", "Social Media",
    "Analista", "Verificador", "Fact Checker", "Crítico", "Comparador",
    "Economista", "Inversor", "Estadístico", "Político", "Historiador",
    "Sintetizador", "Redactor", "Corrector", "Fuentes", "Director",
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, team = "asistente", memory = "" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurado");

    const teamNames = TEAM_AGENTS[team] || TEAM_AGENTS.asistente;
    const agents = teamNames.map((n) => AGENT_POOL.find((a) => a.name === n)!).filter(Boolean);
    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPA_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const emit = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        async function callLLM(systemPrompt: string, history: any[], useTools = false) {
          const tools = useTools ? [
            { type: "function", function: { name: "web_search", description: "Buscar en la web (Google/Bing). Para redes sociales usar queries con site:x.com, site:facebook.com, site:instagram.com.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
            { type: "function", function: { name: "fetch_url", description: "Leer contenido de una URL pública (HTML/PDF).", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
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

          // Selección inteligente: el Recepcionista corre primero y decide qué agentes activar
          // Por ahora corremos todos en orden, pero los specialists pueden decir "no relevante" y se saltean en la síntesis
          for (let i = 0; i < agents.length; i++) {
            const ag = agents[i];
            const isLast = ag.name === "Director";
            const prev = transcript.map((t) => `[${t.agent}]: ${t.output}`).join("\n\n");
            emit({ type: "agent_start", agent: `${ag.emoji} ${ag.name}`, role: ag.role, message: `${ag.name} analizando…` });
            await new Promise((r) => setTimeout(r, 60));

            const history = [
              { role: "user", content: `Consulta del usuario:\n${userQuery}\n\n${prev ? `Trabajo del equipo hasta ahora:\n${prev}\n\n${researchData ? `Datos investigados (resumen):\n${researchData.slice(0, 6000)}\n\n` : ""}` : ""}Tu rol: ${ag.name} (${ag.role}). Respondé SOLO tu parte, máx lo indicado en tu instrucción.` },
            ];

            if (isLast) {
              if (i > 0) emit({ type: "agent_handoff", from: `${agents[i - 1].emoji} ${agents[i - 1].name}`, to: `${ag.emoji} ${ag.name}`, message: "Entregando al Director para respuesta final…" });
              const finalText = await callLLMStream(ag.system, history);
              transcript.push({ agent: ag.name, output: finalText });
            } else {
              if (i > 0) emit({ type: "agent_handoff", from: `${agents[i - 1].emoji} ${agents[i - 1].name}`, to: `${ag.emoji} ${ag.name}`, message: `Pasando a ${ag.name}…` });

              let resp = await callLLM(ag.system, history, !!ag.tools);
              let rounds = 0;
              while (rounds < 3 && resp.choices?.[0]?.message?.tool_calls?.length) {
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
                    tools: [
                      { type: "function", function: { name: "web_search", description: "Buscar en la web.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
                      { type: "function", function: { name: "fetch_url", description: "Leer URL.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
                    ],
                  }),
                }).then((r) => r.json());
                rounds++;
              }
              const out = resp.choices?.[0]?.message?.content || "(sin aporte)";
              emit({ type: "agent_thought", agent: `${ag.emoji} ${ag.name}`, text: out });
              transcript.push({ agent: ag.name, output: out });

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
