import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Globe, Loader2, Mic, Square, User2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ToolCall = { id: string; name: string; arguments: string; result?: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  tools?: ToolCall[];
};

const STARTERS = [
  "¿Cómo formalizo una empresa unipersonal en Paraguay?",
  "Mba'éichapa ajapo cédula pyahu?",
  "¿Qué necesito para inscribirme en el IPS?",
  "Calcular el IRP si gano 8M ₲ al mes",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const SCRAPE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-web`;

export default function AssistantView() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-PY";
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert("Tu navegador no soporta reconocimiento de voz");
    const r = new SR();
    r.lang = "es-PY";
    r.interimResults = false;
    r.onresult = (e: any) => setInput(e.results[0][0].transcript);
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.start();
    recogRef.current = r;
  };
  const stopListening = () => recogRef.current?.stop();

  async function callTool(name: string, args: any): Promise<string> {
    if (name === "web_search") {
      const r = await fetch(SCRAPE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ url: args.url }),
      });
      const data = await r.json();
      return JSON.stringify(data).slice(0, 6000);
    }
    return "tool no soportada";
  }

  async function streamChat(history: Msg[]) {
    const apiMsgs = history.map((m) => ({ role: m.role, content: m.content }));
    let assistantSoFar = "";
    let activeTools: ToolCall[] = [];
    const pendingTools: Record<number, { id?: string; name?: string; args: string }> = {};

    const upsert = (chunk: string, tools?: ToolCall[]) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar, tools: tools ?? m.tools } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar, tools }];
      });
    };

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages: apiMsgs }),
    });

    if (resp.status === 429 || resp.status === 402) {
      const j = await resp.json().catch(() => ({}));
      upsert(`\n\n*${j.error || "Error"}*`);
      return;
    }
    if (!resp.ok || !resp.body) {
      upsert("\n\n*Error de conexión*");
      return;
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let done = false;
    let toolCallsDetected = false;

    while (!done) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || !line.trim()) continue;
        if (!line.startsWith("data: ")) continue;
        const js = line.slice(6).trim();
        if (js === "[DONE]") { done = true; break; }
        try {
          const p = JSON.parse(js);
          const delta = p.choices?.[0]?.delta;
          if (delta?.content) upsert(delta.content);
          if (delta?.tool_calls) {
            toolCallsDetected = true;
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              pendingTools[idx] = pendingTools[idx] || { args: "" };
              if (tc.id) pendingTools[idx].id = tc.id;
              if (tc.function?.name) pendingTools[idx].name = tc.function.name;
              if (tc.function?.arguments) pendingTools[idx].args += tc.function.arguments;
            }
          }
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      }
    }

    // If tool calls were requested, execute them and continue the conversation
    if (toolCallsDetected && Object.keys(pendingTools).length) {
      const toolMsgs: any[] = [];
      const assistantToolMsg: any = { role: "assistant", content: assistantSoFar, tool_calls: [] };
      for (const idx of Object.keys(pendingTools)) {
        const t = pendingTools[+idx];
        if (!t.name || !t.id) continue;
        let parsedArgs: any = {};
        try { parsedArgs = JSON.parse(t.args); } catch { /* */ }
        activeTools.push({ id: t.id, name: t.name, arguments: t.args });
        // Show "consultando..." indicator
        upsert("", [...activeTools]);
        const result = await callTool(t.name, parsedArgs);
        activeTools = activeTools.map((x) => x.id === t.id ? { ...x, result } : x);
        upsert("", [...activeTools]);
        assistantToolMsg.tool_calls.push({
          id: t.id, type: "function",
          function: { name: t.name, arguments: t.args },
        });
        toolMsgs.push({ role: "tool", tool_call_id: t.id, content: result });
      }

      // Reset for second pass
      assistantSoFar = "";
      const fullHistory = [...apiMsgs, assistantToolMsg, ...toolMsgs];
      const resp2 = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ messages: fullHistory }),
      });
      if (resp2.body) {
        const r2 = resp2.body.getReader();
        const d2 = new TextDecoder();
        let b2 = "";
        let done2 = false;
        // Add a new assistant message for the final answer
        setMessages((prev) => [...prev, { role: "assistant", content: "", tools: activeTools }]);
        const upsert2 = (c: string) => {
          assistantSoFar += c;
          setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        };
        while (!done2) {
          const { value, done: dd } = await r2.read();
          if (dd) break;
          b2 += d2.decode(value, { stream: true });
          let nl: number;
          while ((nl = b2.indexOf("\n")) !== -1) {
            let line = b2.slice(0, nl);
            b2 = b2.slice(nl + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const js = line.slice(6).trim();
            if (js === "[DONE]") { done2 = true; break; }
            try {
              const p = JSON.parse(js);
              const c = p.choices?.[0]?.delta?.content;
              if (c) upsert2(c);
            } catch { b2 = line + "\n" + b2; break; }
          }
        }
      }
    }
  }

  const send = async (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || loading) return;
    setInput("");
    setLoading(true);
    const newHistory: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(newHistory);
    try { await streamChat(newHistory); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] w-full max-w-3xl flex-col px-4 sm:px-6">
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-8">
        {empty ? (
          <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <h1 className="font-serif text-3xl">Asistente ciudadano</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Trámites, IPS, MEC, SET, cédula, formalización. En español, guaraní o jopara.
              Consulto webs oficiales `.gov.py` cuando hace falta.
            </p>
            <div className="mt-8 grid w-full gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition hover:border-primary/40 hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "assistant" && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={cn("max-w-[85%]", m.role === "user" ? "rounded-2xl bg-accent px-4 py-2.5 text-accent-foreground" : "")}>
                  {m.tools?.map((t) => (
                    <div key={t.id} className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
                      <Globe className="h-3 w-3" />
                      {t.result ? "consultado" : "consultando"}: <code className="text-[11px]">{(() => { try { return JSON.parse(t.arguments).url; } catch { return t.name; } })()}</code>
                      {!t.result && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
                  ))}
                  {m.role === "assistant" ? (
                    <div className="prose-claude text-[15px]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "..."}</ReactMarkdown>
                      {m.content && (
                        <button
                          onClick={() => speak(m.content)}
                          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                        >
                          <Volume2 className="h-3 w-3" /> {speaking ? "hablando..." : "escuchar"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-[15px] whitespace-pre-wrap">{m.content}</div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface">
                    <User2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> pensando...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pb-6 pt-2">
        <div className="rounded-2xl border border-border bg-card shadow-soft">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escribí en español, guaraní o jopara... (Shift+Enter para salto)"
            className="min-h-[60px] resize-none border-0 bg-transparent px-4 py-3 text-[15px] shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={listening ? stopListening : startListening}
              className={cn("h-8 gap-1.5 text-xs", listening && "bg-destructive/10 text-destructive")}
            >
              {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {listening ? "escuchando..." : "voz"}
            </Button>
            <Button size="icon" onClick={() => send()} disabled={loading || !input.trim()} className="h-8 w-8 rounded-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          PY-OS puede consultar sitios `.gov.py` en vivo · español · guaraní · jopara
        </p>
      </div>
    </div>
  );
}
