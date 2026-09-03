import type { ParsedOutput } from "./parseOutput";

export type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  parsed?: ParsedOutput;
};

export type Fact = { id: string; text: string; category?: string; confidence?: string };

export type SessionSummary = {
  synthesis?: string;
  archives?: string;
  vault?: string;
  historical?: string;
};

export type VaultEntry = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  savedAt: number;
  parsed: ParsedOutput;
  rawContent: string;
};

export type Session = {
  id: string;
  title: string;
  topic: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMsg[];
  facts: Fact[];
  summary?: SessionSummary;
};

const SESSIONS_KEY = "aethelgard.sessions.v1";
const CURRENT_KEY = "aethelgard.sessions.current";
const VAULT_KEY = "aethelgard.vault.v1";

// ─── Limits ────────────────────────────────────────────────────────────────
const MAX_MESSAGES_PER_SESSION = 100; // keep last N messages (plus system)
const MAX_CONTENT_CHARS = 4000;       // truncate raw content; keep parsed
const MAX_SESSIONS = 50;              // evict oldest sessions beyond this

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Trim a single session's messages to MAX_MESSAGES_PER_SESSION. */
function pruneMessages(session: Session): Session {
  const msgs = session.messages;
  if (msgs.length <= MAX_MESSAGES_PER_SESSION) return session;

  // Always keep system messages at the front
  const system = msgs.filter((m) => m.role === "system");
  const rest = msgs.filter((m) => m.role !== "system");
  const trimmed = rest.slice(-MAX_MESSAGES_PER_SESSION);
  return { ...session, messages: [...system, ...trimmed] };
}

/** Strip large raw content from old messages that already have parsed output. */
function compactMessages(session: Session): Session {
  return {
    ...session,
    messages: session.messages.map((m) => {
      if (
        m.role === "assistant" &&
        m.parsed != null &&
        m.content.length > MAX_CONTENT_CHARS
      ) {
        // Keep only a short excerpt — the parsed fields carry all structure
        return { ...m, content: m.content.slice(0, 200) + "…[compacted]" };
      }
      return m;
    }),
  };
}

/** Best-effort size estimate of a value in bytes. */
function roughBytes(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length;
}

// ─── Core storage ──────────────────────────────────────────────────────────

export function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Session[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist sessions with automatic quota recovery.
 *
 * Strategy (in order):
 *   1. Normal write — if it fits, done.
 *   2. Compact all message content that already has `parsed` output.
 *   3. Drop the oldest sessions one-by-one until it fits.
 *   4. If still failing after 10 evictions, give up and log — never throw.
 */
export function saveSessions(sessions: Session[]): void {
  if (typeof window === "undefined") return;

  // Cap session count first
  let trimmed = sessions.slice(0, MAX_SESSIONS);

  // Prune + compact every session
  trimmed = trimmed.map((s) => compactMessages(pruneMessages(s)));

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed));
      window.dispatchEvent(new CustomEvent("aethelgard:sessions-updated"));
      return;
    } catch (err: unknown) {
      const isQuota =
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");

      if (!isQuota) {
        console.error("[aethelgard] saveSessions unexpected error:", err);
        return;
      }

      if (trimmed.length === 0) {
        console.error("[aethelgard] localStorage quota exceeded even with empty sessions array.");
        return;
      }

      // Evict the oldest session (last in the newest-first array)
      console.warn(
        `[aethelgard] localStorage quota exceeded — evicting oldest session (${trimmed[trimmed.length - 1]?.title})`
      );
      trimmed = trimmed.slice(0, -1);
    }
  }
}

export function getCurrentSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CURRENT_KEY);
}

export function setCurrentSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(CURRENT_KEY, id);
  else localStorage.removeItem(CURRENT_KEY);
  window.dispatchEvent(new CustomEvent("aethelgard:sessions-updated"));
}

export function createSession(title = "New Inquiry"): Session {
  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const s: Session = { id, title, topic: title, createdAt: now, updatedAt: now, messages: [], facts: [] };
  const all = loadSessions();
  all.unshift(s);
  saveSessions(all);
  setCurrentSessionId(id);
  return s;
}

export function upsertSession(updated: Session) {
  const all = loadSessions();
  const idx = all.findIndex((s) => s.id === updated.id);
  updated.updatedAt = Date.now();
  if (idx === -1) all.unshift(updated);
  else all[idx] = updated;
  saveSessions(all);
}

export function deleteSession(id: string) {
  const all = loadSessions().filter((s) => s.id !== id);
  saveSessions(all);
  if (getCurrentSessionId() === id) setCurrentSessionId(all[0]?.id ?? null);
}

export function getSession(id: string): Session | undefined {
  return loadSessions().find((s) => s.id === id);
}

// ─── Vault ─────────────────────────────────────────────────────────────────

export function loadVault(): VaultEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VaultEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveToVault(entry: Omit<VaultEntry, "id" | "savedAt">): VaultEntry {
  const all = loadVault();
  const newEntry: VaultEntry = { ...entry, id: `v_${Date.now()}`, savedAt: Date.now() };
  all.unshift(newEntry);
  // Vault gets the same quota-safe write pattern
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      localStorage.setItem(VAULT_KEY, JSON.stringify(all));
      window.dispatchEvent(new CustomEvent("aethelgard:vault-updated"));
      return newEntry;
    } catch {
      if (all.length === 0) break;
      all.pop(); // drop oldest vault entry
    }
  }
  return newEntry;
}

export function removeFromVault(id: string) {
  const all = loadVault().filter((e) => e.id !== id);
  localStorage.setItem(VAULT_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent("aethelgard:vault-updated"));
}

export function isInVault(rawContent: string): boolean {
  return loadVault().some((e) => e.rawContent === rawContent);
}

// ─── Mind-map extraction ───────────────────────────────────────────────────

export async function extractMindMap(opts: {
  endpoint: string;
  model: string;
  token?: string;
  messages: ChatMsg[];
}): Promise<{ topic: string; facts: string[]; summary: SessionSummary } | null> {
  // Fast path: use already-parsed facts — no second model call needed
  const parsedFacts = opts.messages
    .filter((m) => m.role === "assistant" && m.parsed?.isStructured && m.parsed.facts.length)
    .flatMap((m) => m.parsed!.facts);

  if (parsedFacts.length > 0) {
    return {
      topic: "",
      facts: parsedFacts.slice(0, 8),
      summary: { synthesis: "", archives: "", vault: "", historical: "" },
    };
  }

  const transcript = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 800)}`)
    .join("\n\n");

  const sys = `You are an analyst. Extract a structured mind-map from the conversation.
Return STRICT JSON only, no prose, no markdown fences. Schema:
{
  "topic": "short 2-5 word central concept",
  "facts": ["concise factual claim", "..."],
  "summary": {
    "synthesis": "1-2 sentence synthesis",
    "archives": "prior knowledge referenced (1-2 sentences)",
    "vault": "worth saving for future research (1-2 sentences)",
    "historical": "relevant background context (1-2 sentences)"
  }
}
Keep facts atomic, max 8. Empty string for unknown fields.`;

  const body = {
    model: opts.model,
    stream: false,
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Conversation:\n\n${transcript}\n\nReturn the JSON now.` },
    ],
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token?.trim()) headers["Authorization"] = `Bearer ${opts.token.trim()}`;

  try {
    const r = await fetch(opts.endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    if (!r.ok) return null;
    const data = await r.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";
    let clean = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    clean = clean.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const first = clean.indexOf("{");
    const last = clean.lastIndexOf("}");
    if (first === -1 || last === -1) return null;
    const parsed = JSON.parse(clean.slice(first, last + 1));
    return {
      topic: String(parsed.topic ?? "Inquiry"),
      facts: Array.isArray(parsed.facts) ? parsed.facts.map(String).filter(Boolean) : [],
      summary: {
        synthesis: parsed.summary?.synthesis ?? "",
        archives: parsed.summary?.archives ?? "",
        vault: parsed.summary?.vault ?? "",
        historical: parsed.summary?.historical ?? "",
      },
    };
  } catch {
    return null;
  }
}
