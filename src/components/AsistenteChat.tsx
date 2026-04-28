import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { Markdown } from "./Markdown";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "¿Cómo saco mi RUC en la SET?",
  "Mba'éichapa ikatu ahupyty ñepyrũrã peteĩ negocio?",
  "¿Qué necesito para inscribirme en IPS?",
  "¿Cómo accedo a una beca BECAL?",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export function AsistenteChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    let assistantText = "";
    const upsert = (chunk: string) => {
      assistantText += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantText } : m));
        }
        return [...prev, { role: "assistant", content: assistantText }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (resp.status === 429) { upsert("⚠️ Demasiadas solicitudes, probá en un momento."); return; }
      if (resp.status === 402) { upsert("⚠️ Créditos de IA agotados. Recargá tu workspace."); return; }
      if (!resp.ok || !resp.body) { upsert("⚠️ No se pudo conectar."); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) upsert(c);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      upsert("⚠️ Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
        <div className="max-w-3xl mx-auto py-8">
          {empty ? (
            <div className="text-center py-16">
              <h1 className="serif text-4xl mb-3 text-balance">Mba'éichapa, ¿en qué te ayudo?</h1>
              <p className="text-muted-foreground mb-10">
                Tu asistente ciudadano en español, guaraní y jopara.
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left p-4 rounded-2xl border border-border bg-surface hover:border-primary/40 hover:bg-primary/5 transition-all text-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-5 py-3 text-[15px] leading-relaxed">
                      {m.content}
                    </div>
                  ) : (
                    <div className="max-w-full">
                      <Markdown>{m.content || (loading ? "…" : "")}</Markdown>
                    </div>
                  )}
                </div>
              ))}
              {loading && messages[messages.length - 1]?.role === "user" && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="relative"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Escribí tu consulta…"
              rows={1}
              className="py-input w-full pr-14 resize-none min-h-[56px] max-h-40"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="absolute right-2.5 bottom-2.5 w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90 transition-opacity"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            </button>
          </form>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Español · Guaraní · Jopara · PY-OS puede equivocarse, verificá información crítica.
          </p>
        </div>
      </div>
    </div>
  );
}
