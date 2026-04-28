import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowUp, Bot, Globe, Loader2, Mic, Search, Square, User2, Volume2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ChatMessage, Conversation, deleteConversation, deriveTitle,
  loadConversations, newConversation, speakClean, upsertConversation,
} from "@/lib/chat-storage";
import PyOsLayout from "@/components/layout/PyOsLayout";

const SUPA = import.meta.env.VITE_SUPABASE_URL;
const AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
const CHAT_URL = `${SUPA}/functions/v1/chat`;
const SCRAPE_URL = `${SUPA}/functions/v1/scrape-web`;
const SEARCH_URL = `${SUPA}/functions/v1/web-search`;

type Props = {
  module: "asistente" | "auditor";
  title: string;
  subtitle: string;
  starters: string[];
  systemHint?: string; // se prepende como primer user message si quieres
  emptyIcon?: React.ReactNode;
};

export default function ChatShell({ module, title, subtitle, starters, emptyIcon }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation>(() => newConversation(module));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  // cargar lista al montar
  useEffect(() => {
    const list = loadConversations(module);
    setConversations(list);
    if (list.length && list[0].messages.length) setActive(list[0]);
  }, [module]);

  // autoscroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active.messages, loading]);

  // persistir cuando cambie el activo y tenga mensajes
  useEffect(() => {
    if (!active.messages.length) return;
    const conv = { ...active, title: active.title === "Nueva conversación" ? deriveTitle(active.messages) : active.title, updatedAt: Date.now() };
    upsertConversation(module, conv);
    setConversations(loadConversations(module));
  // eslint-disable-next-line
  }, [active.messages.length]);

  const speak = (id: string, text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (speakingId === id) { setSpeakingId(null); return; }
    const u = new SpeechSynthesisUtterance(speakClean(text));
    u.lang = "es-ES";
    u.rate = 1.05;
    u.onstart = () => setSpeakingId(id);
    u.onend = () => setSpeakingId(null);
    u.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(u);
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert("Tu navegador no soporta reconocimiento de voz");
    const r = new SR();
    r.lang = "es-PY";
    r.interimResults = false;
    r.onresult = (e: any) => setInput((prev) => (prev ? prev + " " : "") + e.results[0][0].transcript);
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.start();
    recogRef.current = r;
  };
  const stopListening = () => recogRef.current?.stop();

  const handleNew = useCallback(() => {
    setActive(newConversation(module));
    setInput("");
  }, [module]);

  const handleSelect = useCallback((id: string) => {
    const c = loadConversations(module).find((x) => x.id === id);
    if (c) setActive(c);
  }, [module]);

  const handleDelete = useCallback((id: string) => {
    deleteConversation(module, id);
    const list = loadConversations(module);
    setConversations(list);
    if (id === active.id) setActive(list[0] || newConversation(module));
  }, [module, active.id]);

  async function callTool(name: string, args: any): Promise<{ result: string; summary: string }> {
    if (name === "web_search") {
      const r = await fetch(SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: AUTH },
        body: JSON.stringify({ query: args.query }),
      });
      const data = await r.json();
      const summary = data.results?.length ? `${data.results.length} resultados` : "sin resultados";
      return { result: JSON.stringify(data).slice(0, 6000), summary };
    }
    if (name === "fetch_url" || name === "web_search_url") {
      const r = await fetch(SCRAPE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: AUTH },
        body: JSON.stringify({ url: args.url }),
      });
      const data = await r.json();
      const summary = data.error ? "error" : (data.contentType === "pdf" ? `PDF (${data.pages || "?"} pág)` : "leído");
      return { result: JSON.stringify(data).slice(0, 6000), summary };
    }
    return { result: "tool no soportada", summary: "error" };
  }

  function setLastAssistant(updater: (m: ChatMessage) => ChatMessage) {
    setActive((prev) => {
      const msgs = [...prev.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") msgs[msgs.length - 1] = updater(last);
      return { ...prev, messages: msgs, updatedAt: Date.now() };
    });
  }

  function appendAssistant(content: string, tools?: any[]) {
    setActive((prev) => ({
      ...prev,
      messages: [...prev.messages, { id: crypto.randomUUID(), role: "assistant", content, ts: Date.now(), tools }],
      updatedAt: Date.now(),
    }));
  }

  async function readSSE(resp: Response, onDelta: (c: string) => void, onTool: (tcs: any[]) => void) {
    if (!resp.body) return;
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || !line.trim()) continue;
        if (!line.startsWith("data: ")) continue;
        const js = line.slice(6).trim();
        if (js === "[DONE]") return;
        try {
          const p = JSON.parse(js);
          const delta = p.choices?.[0]?.delta;
          if (delta?.content) onDelta(delta.content);
          if (delta?.tool_calls) onTool(delta.tool_calls);
        } catch {
          buf = line + "\n" + buf; break;
        }
      }
    }
  }

  async function streamTurn(history: ChatMessage[]) {
    const apiMsgs = history.map((m) => ({ role: m.role, content: m.content }));
    appendAssistant("", []);

    let assistantSoFar = "";
    const pendingTools: Record<number, { id?: string; name?: string; args: string }> = {};
    let activeTools: any[] = [];

    abortRef.current = new AbortController();
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: AUTH },
      body: JSON.stringify({ messages: apiMsgs }),
      signal: abortRef.current.signal,
    });

    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      setLastAssistant((m) => ({ ...m, content: `*${j.error || "Error de conexión"}*` }));
      return;
    }

    await readSSE(resp,
      (c) => {
        assistantSoFar += c;
        setLastAssistant((m) => ({ ...m, content: assistantSoFar }));
      },
      (tcs) => {
        for (const tc of tcs) {
          const idx = tc.index ?? 0;
          pendingTools[idx] = pendingTools[idx] || { args: "" };
          if (tc.id) pendingTools[idx].id = tc.id;
          if (tc.function?.name) pendingTools[idx].name = tc.function.name;
          if (tc.function?.arguments) pendingTools[idx].args += tc.function.arguments;
        }
      },
    );

    if (Object.keys(pendingTools).length === 0) return;

    // Ejecutar herramientas
    const assistantToolMsg: any = { role: "assistant", content: assistantSoFar, tool_calls: [] };
    const toolMsgs: any[] = [];
    for (const idx of Object.keys(pendingTools)) {
      const t = pendingTools[+idx];
      if (!t.name || !t.id) continue;
      let parsedArgs: any = {}; try { parsedArgs = JSON.parse(t.args); } catch {}
      activeTools.push({ id: t.id, name: t.name, arguments: t.args });
      setLastAssistant((m) => ({ ...m, tools: [...activeTools] }));
      const { result, summary } = await callTool(t.name, parsedArgs);
      activeTools = activeTools.map((x) => x.id === t.id ? { ...x, result, resultSummary: summary } : x);
      setLastAssistant((m) => ({ ...m, tools: [...activeTools] }));
      assistantToolMsg.tool_calls.push({ id: t.id, type: "function", function: { name: t.name, arguments: t.args } });
      toolMsgs.push({ role: "tool", tool_call_id: t.id, content: result });
    }

    // Segunda pasada con resultados → nueva burbuja assistant
    appendAssistant("", []);
    let so2 = "";
    const resp2 = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: AUTH },
      body: JSON.stringify({ messages: [...apiMsgs, assistantToolMsg, ...toolMsgs] }),
      signal: abortRef.current.signal,
    });
    if (!resp2.ok) {
      setLastAssistant((m) => ({ ...m, content: "*Error en segunda fase*" }));
      return;
    }
    // (puede haber más tool calls; simplificamos a una ronda más)
    const moreTools: Record<number, { id?: string; name?: string; args: string }> = {};
    let moreActiveTools: any[] = [];
    await readSSE(resp2,
      (c) => { so2 += c; setLastAssistant((m) => ({ ...m, content: so2 })); },
      (tcs) => {
        for (const tc of tcs) {
          const idx = tc.index ?? 0;
          moreTools[idx] = moreTools[idx] || { args: "" };
          if (tc.id) moreTools[idx].id = tc.id;
          if (tc.function?.name) moreTools[idx].name = tc.function.name;
          if (tc.function?.arguments) moreTools[idx].args += tc.function.arguments;
        }
      },
    );

    // Una ronda más si pidió más tools
    if (Object.keys(moreTools).length) {
      const atm: any = { role: "assistant", content: so2, tool_calls: [] };
      const tm: any[] = [];
      for (const idx of Object.keys(moreTools)) {
        const t = moreTools[+idx];
        if (!t.name || !t.id) continue;
        let pa: any = {}; try { pa = JSON.parse(t.args); } catch {}
        moreActiveTools.push({ id: t.id, name: t.name, arguments: t.args });
        setLastAssistant((m) => ({ ...m, tools: [...(m.tools || []), ...moreActiveTools] }));
        const { result, summary } = await callTool(t.name, pa);
        moreActiveTools = moreActiveTools.map((x) => x.id === t.id ? { ...x, result, resultSummary: summary } : x);
        setLastAssistant((m) => ({ ...m, tools: [...(m.tools || []).filter((x: any) => !moreActiveTools.find((y) => y.id === x.id)), ...moreActiveTools] }));
        atm.tool_calls.push({ id: t.id, type: "function", function: { name: t.name, arguments: t.args } });
        tm.push({ role: "tool", tool_call_id: t.id, content: result });
      }
      appendAssistant("", []);
      let so3 = "";
      const resp3 = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: AUTH },
        body: JSON.stringify({ messages: [...apiMsgs, assistantToolMsg, ...toolMsgs, atm, ...tm] }),
      });
      if (resp3.ok) {
        await readSSE(resp3, (c) => { so3 += c; setLastAssistant((m) => ({ ...m, content: so3 })); }, () => {});
      }
    }
  }

  const send = async (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || loading) return;
    setInput("");
    setLoading(true);
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: t, ts: Date.now() };
    const newHistory = [...active.messages, userMsg];
    setActive((prev) => ({ ...prev, messages: newHistory, updatedAt: Date.now() }));
    try { await streamTurn(newHistory); }
    catch (e: any) {
      if (e.name !== "AbortError") console.error(e);
    } finally {
      setLoading(false);
      // Persistir final
      setActive((prev) => {
        const conv = { ...prev, title: prev.title === "Nueva conversación" ? deriveTitle(prev.messages) : prev.title, updatedAt: Date.now() };
        upsertConversation(module, conv);
        setConversations(loadConversations(module));
        return conv;
      });
    }
  };

  const empty = active.messages.length === 0;

  return (
    <PyOsLayout
      conversations={conversations}
      activeId={active.id}
      onNew={handleNew}
      onSelect={handleSelect}
      onDelete={handleDelete}
      showHistory
    >
      <div className="mx-auto flex h-[calc(100vh-3.5rem)] w-full max-w-3xl flex-col px-3 sm:px-6">
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-6">
          {empty ? (
            <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                {emptyIcon || <Bot className="h-6 w-6 text-primary" />}
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl">{title}</h1>
              <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
              <div className="mt-8 grid w-full gap-2">
                {starters.map((s) => (
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
              {active.messages.map((m) => (
                <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "assistant" && (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={cn("min-w-0 max-w-[88%]", m.role === "user" ? "rounded-2xl bg-accent px-4 py-2.5 text-accent-foreground" : "")}>
                    {m.tools?.map((t) => {
                      let display = t.name;
                      try {
                        const a = JSON.parse(t.arguments);
                        display = a.url || a.query || t.name;
                      } catch {}
                      const Icon = t.name === "web_search" ? Search : Globe;
                      return (
                        <div key={t.id} className="mb-2 flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="shrink-0">{t.result ? (t.resultSummary || "consultado") : "consultando"}:</span>
                          <code className="truncate text-[11px]">{display}</code>
                          {!t.result && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                        </div>
                      );
                    })}
                    {m.role === "assistant" ? (
                      <div className="prose-claude break-words text-[15px]">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5">
                                {children}<ExternalLink className="inline h-3 w-3" />
                              </a>
                            ),
                          }}
                        >
                          {m.content || (loading ? "..." : "")}
                        </ReactMarkdown>
                        {m.content && (
                          <button
                            onClick={() => speak(m.id, m.content)}
                            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                          >
                            <Volume2 className="h-3 w-3" /> {speakingId === m.id ? "detener" : "escuchar"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-[15px] whitespace-pre-wrap break-words">{m.content}</div>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface">
                      <User2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {loading && active.messages[active.messages.length - 1]?.role === "user" && (
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

        <div className="pb-4 pt-2 sm:pb-6">
          <div className="rounded-2xl border border-border bg-card shadow-soft">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Escribí en español, guaraní o jopara... (Shift+Enter para salto)"
              className="min-h-[56px] resize-none border-0 bg-transparent px-4 py-3 text-[15px] shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <Button
                variant="ghost" size="sm"
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
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            PY-OS busca en webs `.gov.py` y medios paraguayos · español · guaraní · jopara
          </p>
        </div>
      </div>
    </PyOsLayout>
  );
}
