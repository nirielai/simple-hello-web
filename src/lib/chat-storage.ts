// Storage local de conversaciones tipo ChatGPT
export type ChatRole = "user" | "assistant";
export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  resultSummary?: string;
};
export type AgentStep = {
  id: string;
  agent: string;
  role: string;
  status: "thinking" | "tool" | "handoff" | "done";
  text?: string;
  tool?: string;
  toolInput?: any;
  toolSummary?: string;
  to?: string;
  ts: number;
};
export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  tools?: ToolCall[];
  agents?: AgentStep[];
  ts: number;
};
export type ModuleKey = "asistente" | "auditor" | "economia";
export type Conversation = {
  id: string;
  title: string;
  module: ModuleKey;
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

export function newConversation(module: ModuleKey): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Nueva conversación",
    module,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function clearAllConversations(module: string) {
  saveConversations(module, []);
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

// ---------- MEMORIA DE APRENDIZAJE ----------
// Cada módulo guarda una lista de "hechos" cortos sobre el usuario.
// Se usan en el system prompt para que la IA sea más inteligente con cada conversación.
const MEM_KEY = (m: string) => `pyos.memory.${m}`;
const MAX_FACTS = 30;

export type MemoryFact = { id: string; text: string; ts: number };

export function loadMemory(module: string): MemoryFact[] {
  try { return JSON.parse(localStorage.getItem(MEM_KEY(module)) || "[]"); } catch { return []; }
}
export function saveMemory(module: string, facts: MemoryFact[]) {
  try { localStorage.setItem(MEM_KEY(module), JSON.stringify(facts.slice(0, MAX_FACTS))); } catch {}
}
export function addMemoryFact(module: string, text: string) {
  const t = text.trim();
  if (!t || t.length < 4) return;
  const facts = loadMemory(module);
  // dedup
  if (facts.some((f) => f.text.toLowerCase() === t.toLowerCase())) return;
  facts.unshift({ id: crypto.randomUUID(), text: t, ts: Date.now() });
  saveMemory(module, facts);
}
export function clearMemory(module: string) {
  saveMemory(module, []);
}
export function memoryAsContext(module: string): string {
  const facts = loadMemory(module);
  if (!facts.length) return "";
  return facts.slice(0, 20).map((f, i) => `${i + 1}. ${f.text}`).join("\n");
}

// Heurísticas simples para extraer hechos del mensaje del usuario
export function extractFactsFromUserMessage(module: string, content: string) {
  const t = content.trim();
  if (t.length < 8) return;
  const lower = t.toLowerCase();

  const patterns: RegExp[] = [
    /\bsoy\s+([a-záéíóúñ ]{3,40})/i,
    /\btrabajo (?:en|de|como)\s+([a-záéíóúñ ]{3,40})/i,
    /\bmi (?:negocio|empresa|rubro) es\s+([a-záéíóúñ ]{3,40})/i,
    /\bvivo en\s+([a-záéíóúñ ]{3,40})/i,
    /\btengo\s+(\d{1,3})\s+años/i,
    /\bgano\s+(₲|gs\.?|guaran[ií]es?\s+)?\s*([\d\.\,]+)/i,
    /\bme llamo\s+([a-záéíóúñ ]{3,30})/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const fact = m[0].slice(0, 120);
      addMemoryFact(module, fact);
    }
  }
  // Intereses recurrentes
  const topics = ["dólar", "real", "euro", "ips", "set", "irp", "iva", "ruc", "cédula", "mec", "dncp", "inversión", "ahorro", "préstamo"];
  for (const t2 of topics) {
    if (lower.includes(t2)) addMemoryFact(module, `Le interesa el tema: ${t2}`);
  }
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
