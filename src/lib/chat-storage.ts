// Storage local de conversaciones tipo ChatGPT
export type ChatRole = "user" | "assistant";
export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  resultSummary?: string; // p.ej. "3 resultados" / "consultado"
};
export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  tools?: ToolCall[];
  ts: number;
};
export type Conversation = {
  id: string;
  title: string;
  module: "asistente" | "auditor";
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

const KEY = (m: string) => `pyos.conversations.${m}`;

export function loadConversations(module: string): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY(module));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

export function saveConversations(module: string, list: Conversation[]) {
  try { localStorage.setItem(KEY(module), JSON.stringify(list)); } catch {}
}

export function newConversation(module: "asistente" | "auditor"): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Nueva conversación",
    module,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function upsertConversation(module: string, conv: Conversation) {
  const list = loadConversations(module);
  const idx = list.findIndex((c) => c.id === conv.id);
  if (idx >= 0) list[idx] = conv;
  else list.unshift(conv);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  saveConversations(module, list.slice(0, 50)); // máx 50
}

export function deleteConversation(module: string, id: string) {
  saveConversations(module, loadConversations(module).filter((c) => c.id !== id));
}

export function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Nueva conversación";
  return first.content.slice(0, 50).trim() + (first.content.length > 50 ? "…" : "");
}

// Limpia texto para TTS: convierte números y abreviaturas problemáticas
export function speakClean(text: string): string {
  let t = text;
  // Quitar markdown
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\*\*?([^*]+)\*\*?/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // [texto](url) -> texto
  t = t.replace(/^#+\s+/gm, "");
  t = t.replace(/[•·▪▫◦●○]/g, ", ");
  t = t.replace(/[🟢🟡🔴🟠✅❌⚠️📌📍🇵🇾]/g, "");
  // Símbolos
  t = t.replace(/₲\s*/g, "guaraníes ");
  t = t.replace(/\bGs\.?\s*/gi, "guaraníes ");
  t = t.replace(/US\$\s*/g, "dólares ");
  t = t.replace(/\bUSD\b/g, "dólares");
  // Números con miles "1.234.567" -> "1234567" (que el TTS los lea como número)
  t = t.replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (m) => m.replace(/\./g, ""));
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
