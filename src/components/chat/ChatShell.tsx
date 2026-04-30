import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowUp, Bot, Globe, Loader2, Mic, Search, Square, User2, Volume2, ExternalLink, Users, ArrowRight, Sparkles, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ChatMessage, Conversation, AgentStep, ModuleKey,
  clearAllConversations, deleteConversation, deriveTitle,
  loadConversations, newConversation, speakClean, upsertConversation,
  memoryAsContext, extractFactsFromUserMessage,
} from "@/lib/chat-storage";
import PyOsLayout from "@/components/layout/PyOsLayout";

const SUPA = import.meta.env.VITE_SUPABASE_URL;
const AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
const TEAM_URL = `${SUPA}/functions/v1/agents-team`;

type Props = {
  module: ModuleKey;
  team?: ModuleKey;
  title: string;
  subtitle: string;
  starters: string[];
  emptyIcon?: React.ReactNode;
  topBar?: React.ReactNode;
};

export default function ChatShell({ module, team, title, subtitle, starters, emptyIcon, topBar }: Props) {
  const teamKey = team || module;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation>(() => newConversation(module));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const list = loadConversations(module);
    setConversations(list);
    if (list.length && list[0].messages.length) setActive(list[0]);
  }, [module]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active.messages, loading]);

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
    u.lang = "es-ES"; u.rate = 1.05;
    u.onstart = () => setSpeakingId(id);
    u.onend = () => setSpeakingId(null);
    u.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(u);
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert("Tu navegador no soporta reconocimiento de voz");
    const r = new SR();
    r.lang = "es-PY"; r.interimResults = false;
    r.onresult = (e: any) => setInput((prev) => (prev ? prev + " " : "") + e.results[0][0].transcript);
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.start();
    recogRef.current = r;
  };
  const stopListening = () => recogRef.current?.stop();

  const handleNew = useCallback(() => { setActive(newConversation(module)); setInput(""); }, [module]);
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
  const handleClearAll = useCallback(() => {
    clearAllConversations(module);
    setConversations([]);
    setActive(newConversation(module));
  }, [module]);

  function setLastAssistant(updater: (m: ChatMessage) => ChatMessage) {
    setActive((prev) => {
      const msgs = [...prev.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") msgs[msgs.length - 1] = updater(last);
      return { ...prev, messages: msgs, updatedAt: Date.now() };
    });
  }

  function appendAssistant() {
    setActive((prev) => ({
      ...prev,
      messages: [...prev.messages, { id: crypto.randomUUID(), role: "assistant", content: "", agents: [], ts: Date.now() }],
      updatedAt: Date.now(),
    }));
  }

  async function streamTurn(history: ChatMessage[]) {
    const apiMsgs = history.map((m) => ({ role: m.role, content: m.content }));
    appendAssistant();

    const memory = memoryAsContext(module);
    abortRef.current = new AbortController();
    const resp = await fetch(TEAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: AUTH },
      body: JSON.stringify({ messages: apiMsgs, team: teamKey, memory }),
      signal: abortRef.current.signal,
    });

    if (!resp.ok || !resp.body) {
      const j = await resp.json().catch(() => ({}));
      setLastAssistant((m) => ({ ...m, content: `*${j.error || "Error de conexión"}*` }));
      return;
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let final = "";
    let agents: AgentStep[] = [];

    const updateAgent = (id: string, patch: Partial<AgentStep>) => {
      agents = agents.map((a) => a.id === id ? { ...a, ...patch } : a);
      setLastAssistant((m) => ({ ...m, agents: [...agents] }));
    };
    const addAgent = (a: AgentStep) => {
      agents = [...agents, a];
      setLastAssistant((m) => ({ ...m, agents: [...agents] }));
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, nl); buf = buf.slice(nl + 2);
        const line = block.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "agent_start") {
            // Marcar el anterior como done si quedó "thinking"
            agents = agents.map((a) => a.status === "thinking" ? { ...a, status: "done" } : a);
            addAgent({ id: crypto.randomUUID(), agent: ev.agent, role: ev.role, status: "thinking", ts: Date.now() });
          } else if (ev.type === "agent_thought") {
            const last = [...agents].reverse().find((a) => a.agent === ev.agent);
            if (last) updateAgent(last.id, { text: ev.text, status: "done" });
          } else if (ev.type === "agent_handoff") {
            addAgent({ id: crypto.randomUUID(), agent: ev.from, role: "handoff", status: "handoff", to: ev.to, text: ev.message, ts: Date.now() });
          } else if (ev.type === "tool_call") {
            addAgent({ id: crypto.randomUUID(), agent: ev.agent, role: "tool", status: "tool", tool: ev.tool, toolInput: ev.input, text: ev.summary, ts: Date.now() });
          } else if (ev.type === "tool_result") {
            const last = [...agents].reverse().find((a) => a.agent === ev.agent && a.tool === ev.tool && !a.toolSummary);
            if (last) updateAgent(last.id, { toolSummary: ev.summary, status: "done" });
          } else if (ev.type === "delta") {
            final += ev.text;
            setLastAssistant((m) => ({ ...m, content: final }));
          } else if (ev.type === "error") {
            setLastAssistant((m) => ({ ...m, content: `*Error: ${ev.error}*` }));
          }
        } catch {}
      }
    }
    // marcar todo como done
    agents = agents.map((a) => a.status === "thinking" ? { ...a, status: "done" } : a);
    setLastAssistant((m) => ({ ...m, agents: [...agents], content: final || m.content }));
  }

  const send = async (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || loading) return;
    setInput("");
    setLoading(true);
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: t, ts: Date.now() };
    extractFactsFromUserMessage(module, t);
    const newHistory = [...active.messages, userMsg];
    setActive((prev) => ({ ...prev, messages: newHistory, updatedAt: Date.now() }));
    try { await streamTurn(newHistory); }
    catch (e: any) { if (e.name !== "AbortError") console.error(e); }
    finally {
      setLoading(false);
      setActive((prev) => {
        const conv = { ...prev, title: prev.title === "Nueva conversación" ? deriveTitle(prev.messages) : prev.title, updatedAt: Date.now() };
        upsertConversation(module, conv);
        setConversations(loadConversations(module));
        return conv;
      });
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const empty = active.messages.length === 0;

  return (
    <PyOsLayout
      conversations={conversations}
      activeId={active.id}
      onNew={handleNew}
      onSelect={handleSelect}
      onDelete={handleDelete}
      onClearAll={handleClearAll}
      showHistory
    >
      <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col px-3 sm:px-6">
        {topBar}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-6">
          {empty ? (
            <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                {emptyIcon || <Bot className="h-6 w-6 text-primary" />}
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl">{title}</h1>
              <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" /> Equipo de sub-agentes especializados trabajando en cada respuesta
              </div>
              <div className="mt-6 grid w-full gap-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition hover:border-primary/40 hover:bg-accent"
                  >{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {active.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  m={m}
                  speakingId={speakingId}
                  onSpeak={() => speak(m.id, m.content)}
                  loading={loading && m === active.messages[active.messages.length - 1]}
                />
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 -mx-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:mx-0 sm:border-0 sm:bg-transparent sm:py-4">
          <div className="relative rounded-2xl border border-border bg-card shadow-soft">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={loading ? "El equipo está trabajando…" : "Escribí tu consulta…"}
              rows={1}
              disabled={loading}
              className="min-h-[52px] resize-none border-0 bg-transparent pr-24 focus-visible:ring-0"
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <Button
                variant="ghost" size="icon"
                onClick={listening ? stopListening : startListening}
                className={cn("h-8 w-8", listening && "text-destructive")}
                disabled={loading}
              ><Mic className="h-4 w-4" /></Button>
              {loading ? (
                <Button onClick={stop} size="icon" variant="destructive" className="h-8 w-8">
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => send()} disabled={!input.trim()} size="icon" className="h-8 w-8">
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            PY-OS puede equivocarse. Verificá información crítica en fuentes oficiales.
          </p>
        </div>
      </div>
    </PyOsLayout>
  );
}

// ---------- Message bubble + Agent timeline ----------
function MessageBubble({ m, speakingId, onSpeak, loading }: {
  m: ChatMessage; speakingId: string | null; onSpeak: () => void; loading?: boolean;
}) {
  const [showAgents, setShowAgents] = useState(false);

  if (m.role === "user") {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[88%] rounded-2xl bg-accent px-4 py-2.5 text-accent-foreground">
          <div className="text-[15px] whitespace-pre-wrap break-words">{m.content}</div>
        </div>
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface">
          <User2 className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        {/* Timeline de agentes */}
        {!!m.agents?.length && (
          <div className="mb-3 rounded-xl border border-border bg-surface/40 p-3">
            <button
              onClick={() => setShowAgents((v) => !v)}
              className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Conversación del equipo</span>
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{m.agents.length}</span>
              {showAgents ? <ChevronUp className="ml-auto h-3 w-3" /> : <ChevronDown className="ml-auto h-3 w-3" />}
            </button>
            {showAgents && (
              <ol className="mt-3 space-y-1">
                {m.agents.map((a) => <AgentRow key={a.id} a={a} />)}
              </ol>
            )}
            {!showAgents && m.agents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {[...new Set(m.agents.map((a) => a.agent))].map((name) => (
                  <span key={name} className="inline-flex items-center rounded-md bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/50">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Respuesta final */}
        {m.content && (
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
            >{m.content}</ReactMarkdown>
            <button
              onClick={onSpeak}
              className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <Volume2 className="h-3 w-3" /> {speakingId === m.id ? "detener" : "escuchar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentRow({ a }: { a: AgentStep }) {
  if (a.status === "handoff") {
    return (
      <li className="flex items-center gap-1.5 py-0.5 pl-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/70">{a.agent}</span>
        <ArrowRight className="h-3 w-3" />
        <span className="font-medium text-foreground/70">{a.to}</span>
        {a.text && <span className="truncate opacity-60">· {a.text}</span>}
      </li>
    );
  }
  if (a.status === "tool") {
    return (
      <li className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition",
        a.toolSummary ? "border-border bg-card" : "border-primary/20 bg-primary/5 animate-pulse",
      )}>
        {a.tool === "web_search" ? <Search className={cn("h-3 w-3 shrink-0", !a.toolSummary && "text-primary")} /> : <Globe className={cn("h-3 w-3 shrink-0", !a.toolSummary && "text-primary")} />}
        <span className="shrink-0 font-medium">{a.agent}</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{a.text || a.tool}</span>
        {a.toolSummary ? (
          <span className="shrink-0 rounded bg-surface px-1 py-0.5 text-[9px] text-muted-foreground">{a.toolSummary}</span>
        ) : (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
        )}
      </li>
    );
  }
  return (
    <li className={cn(
      "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs transition",
      a.status === "thinking" ? "bg-primary/5 animate-pulse" : "hover:bg-surface/50",
    )}>
      {a.status === "thinking" ? (
        <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary" />
      ) : (
        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" />
      )}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-foreground/90">{a.agent}</span>
        </div>
        {a.text && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">{a.text}</p>
        )}
      </div>
    </li>
  );
}
