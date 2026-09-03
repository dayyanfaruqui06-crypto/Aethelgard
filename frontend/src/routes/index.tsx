import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Settings2, Loader2, Trash2,
  Plus, MessageSquare, RotateCcw, Download,
} from "lucide-react";
import {
  createSession, deleteSession, extractMindMap,
  getCurrentSessionId, loadSessions, setCurrentSessionId,
  upsertSession, type ChatMsg, type Session,
} from "@/lib/sessions";
import { parseStructuredOutput, parseStreamingOutput } from "@/lib/parseOutput";
import { MessageContent } from "@/components/MessageContent";
import { HealthBadge } from "@/components/HealthBadge";

const PROXY_URL = "http://localhost:8000/v1/chat/completions";
const DEFAULT_MODEL =
  (import.meta.env.VITE_MODEL_NAME as string | undefined)?.trim() ||
  "deepseek-r1-distill-qwen-7b";

const LS_MODEL  = "aethelgard.model";
const LS_SYSTEM = "aethelgard.system";

const PROMPT_SUGGESTIONS = [
  "Analyse a social interaction I had recently",
  "Examine a belief I hold and its foundations",
  "Help me reason through a difficult decision",
  "Explore a pattern I keep noticing in my behaviour",
];

export const Route = createFileRoute("/")(({
  head: () => ({ meta: [{ title: "Intelligence — Aethelgard" }] }),
  component: Intelligence,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)     return "just now";
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function autoTitle(firstUserMessage: string): string {
  return firstUserMessage.trim().split(/\s+/).slice(0, 6).join(" ").replace(/[?.!,]+$/, "");
}

function exportSession(session: Session) {
  const lines: string[] = [`# ${session.title}`, `*${new Date(session.createdAt).toLocaleString()}*`, ""];
  for (const m of session.messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      lines.push("## You", m.content, "");
    } else {
      lines.push("## Aethelgard");
      if (m.parsed?.isStructured) {
        // Facts
        if (m.parsed.facts.length) {
          lines.push("**Facts**");
          m.parsed.facts.forEach((f) => lines.push(`- ${f}`));
          lines.push("");
        }
        // Reasoning
        if (m.parsed.reasoning) lines.push("**Reasoning**", m.parsed.reasoning, "");
        // Other possible explanations
        if (m.parsed.otherExplanations?.length) {
          lines.push("**Other possible explanations**");
          m.parsed.otherExplanations.forEach((e) => lines.push(`- ${e}`));
          lines.push("");
        }
        // Confidence
        if (m.parsed.confidence)
          lines.push(
            `**Confidence:** ${m.parsed.confidence.label}${m.parsed.confidence.note ? ` — ${m.parsed.confidence.note}` : ""}`,
            "",
          );
        // In practice
        if (m.parsed.inPractice) lines.push("**In practice**", m.parsed.inPractice, "");
        // Answer / extra text
        if (m.parsed.answer) lines.push(m.parsed.answer, "");
      } else {
        lines.push(m.content, "");
      }
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = Object.assign(document.createElement("a"), {
    href:     URL.createObjectURL(blob),
    download: `${session.title.replace(/\s+/g, "_")}.md`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Component ─────────────────────────────────────────────────────────────────

function Intelligence() {
  const [sessions,        setSessions]        = useState<Session[]>([]);
  const [currentId,       setCurrentIdState]  = useState<string | null>(null);
  const [input,           setInput]           = useState("");
  const [loading,         setLoading]         = useState(false);
  const [extracting,      setExtracting]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [showSettings,    setShowSettings]    = useState(false);
  const [model,           setModel]           = useState(DEFAULT_MODEL);
  const [system,          setSystem]          = useState(
    "You are a thoughtful and precise psychology assistant who explains concepts clearly and deeply. Always structure your response exactly as:\n\nFacts (explicitly stated, no assumptions):\n[bullet points]\n\nReasoning:\n[detailed psychological analysis]\n\nOther possible explanations:\n[named patterns with explanations]\n\nConfidence: [High/Medium/Low]\nRationale:\n[why this confidence level]\n\nIn practice:\n[one concrete actionable insight]",
  );
  const abortRef    = useRef<AbortController | null>(null);
  const lastUserRef = useRef<string | null>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setModel(localStorage.getItem(LS_MODEL) || DEFAULT_MODEL);
    const s = localStorage.getItem(LS_SYSTEM);
    if (s) setSystem(s);

    const onSettings = () => {
      setModel(localStorage.getItem(LS_MODEL) || DEFAULT_MODEL);
      const s2 = localStorage.getItem(LS_SYSTEM);
      if (s2) setSystem(s2);
    };

    const refresh = () => {
      const all = loadSessions();
      setSessions(all);
      let cur = getCurrentSessionId();
      if (!cur && all.length) { cur = all[0].id; setCurrentSessionId(cur); }
      setCurrentIdState(cur);
    };

    refresh();
    window.addEventListener("aethelgard:sessions-updated", refresh);
    window.addEventListener("aethelgard:settings-updated", onSettings);
    return () => {
      window.removeEventListener("aethelgard:sessions-updated", refresh);
      window.removeEventListener("aethelgard:settings-updated", onSettings);
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "k") {
        e.preventDefault();
        (document.querySelector("textarea") as HTMLTextAreaElement | null)?.focus();
      }
      if (meta && e.key === "n") { e.preventDefault(); newSession(); }
      if (e.key === "Escape" && loading) { stop(); }
      if (meta && e.shiftKey && e.key === "e") {
        e.preventDefault();
        const cur = loadSessions().find((s) => s.id === getCurrentSessionId());
        if (cur && cur.messages.length > 0) exportSession(cur);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loading, currentId]);

  const current  = sessions.find((s) => s.id === currentId) ?? null;
  const messages = current?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  const persistSettings = () => {
    localStorage.setItem(LS_MODEL,  model);
    localStorage.setItem(LS_SYSTEM, system);
    window.dispatchEvent(new CustomEvent("aethelgard:settings-updated"));
  };

  function ensureSession(): Session {
    if (current) return current;
    const s = createSession("New Inquiry");
    setSessions(loadSessions());
    setCurrentIdState(s.id);
    return s;
  }

  function updateCurrent(mutator: (s: Session) => Session) {
    const base = current ?? ensureSession();
    upsertSession(mutator({ ...base }));
    setSessions(loadSessions());
  }

  async function runExtraction(sessionId: string, msgs: ChatMsg[]) {
    setExtracting(true);
    try {
      const result = await extractMindMap({ endpoint: PROXY_URL, model, messages: msgs });
      if (!result) return;
      const all = loadSessions();
      const s   = all.find((x) => x.id === sessionId);
      if (!s) return;
      if (result.topic) { s.topic = result.topic; s.title = result.topic; }
      const parsedFacts = msgs
        .filter((m) => m.role === "assistant" && m.parsed?.isStructured)
        .flatMap((m) => m.parsed!.facts);
      s.facts   = (parsedFacts.length > 0 ? parsedFacts : result.facts)
        .map((text, i) => ({ id: `f_${i}_${Date.now()}`, text }));
      s.summary = result.summary;
      upsertSession(s);
      setSessions(loadSessions());
    } finally {
      setExtracting(false);
    }
  }

  async function runChat(text: string) {
    if (loading) return;
    setError(null);

    const session         = ensureSession();
    const isFirstExchange = session.messages.filter((m) => m.role === "user").length === 0;
    const userMsg: ChatMsg = { role: "user", content: text, timestamp: Date.now() };
    const baseMessages: ChatMsg[] = [...session.messages, userMsg];

    if (isFirstExchange && session.title === "New Inquiry") {
      upsertSession({ ...session, title: autoTitle(text), topic: autoTitle(text), messages: baseMessages });
    } else {
      updateCurrent((s) => ({ ...s, messages: baseMessages }));
    }

    lastUserRef.current = text;
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(PROXY_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model,
          stream:   true,
          messages: [{ role: "system" as const, content: system }, ...baseMessages.slice(-6)],
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const detail = await resp.text().catch(() => "");
        throw new Error(`Model returned ${resp.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
      }

      const assistantMsg: ChatMsg = { role: "assistant", content: "", timestamp: Date.now() };
      let working: ChatMsg[] = [...baseMessages, assistantMsg];
      updateCurrent((s) => ({ ...s, messages: working }));

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":") || !line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              const streamParsed = parseStreamingOutput(acc);
              working = [...baseMessages, { ...assistantMsg, content: acc, parsed: streamParsed }];
              updateCurrent((s) => ({ ...s, messages: working }));
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      const finalParsed = parseStructuredOutput(acc);
      const finalMsg: ChatMsg = { ...assistantMsg, content: acc, parsed: finalParsed };
      working = [...baseMessages, finalMsg];
      const reloadedSession = loadSessions().find((s) => s.id === session.id) ?? session;
      upsertSession({ ...reloadedSession, messages: working });
      setSessions(loadSessions());

      runExtraction(session.id, working);
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err.name !== "AbortError") setError(err.message ?? "Request failed");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    void runChat(text);
  }

  function stop() { abortRef.current?.abort(); setLoading(false); }

  function clearChat() {
    if (!current) return;
    updateCurrent((s) => ({ ...s, messages: [], facts: [], summary: undefined }));
    setError(null);
  }

  function retry() {
    if (loading || !current) return;
    const msgs = [...current.messages];
    while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    const lastUser = msgs[msgs.length - 1]?.role === "user"
      ? msgs[msgs.length - 1].content : lastUserRef.current;
    if (!lastUser) return;
    if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
    updateCurrent((s) => ({ ...s, messages: msgs }));
    void runChat(lastUser);
  }

  function newSession()        { const s = createSession("New Inquiry"); setSessions(loadSessions()); setCurrentIdState(s.id); }
  function selectSession(id: string) { setCurrentSessionId(id); setCurrentIdState(id); }
  function removeSession(id: string) { deleteSession(id); setSessions(loadSessions()); setCurrentIdState(getCurrentSessionId()); }

  return (
    <div className="h-full flex">
      {/* Session rail */}
      <div className="w-60 border-r border-border bg-card/20 flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="label-mono">Sessions</div>
          <button onClick={newSession} title="New session (Ctrl+N)" className="text-gold hover:opacity-80 p-1">
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 && <p className="text-xs text-muted-foreground p-2">No sessions yet.</p>}
          {sessions.map((s) => {
            const active = s.id === currentId;
            return (
              <div
                key={s.id}
                className={`group flex items-start gap-2 px-2 py-2 rounded-sm cursor-pointer ${active ? "bg-background/60" : "hover:bg-background/30"}`}
                onClick={() => selectSession(s.id)}
              >
                <MessageSquare size={14} className={`mt-0.5 shrink-0 ${active ? "text-gold" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{s.title || "Untitled"}</div>
                  <div className="label-mono text-[0.55rem] opacity-60">
                    {s.facts.length} facts · {new Date(s.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100"
                  title="Delete session"
                ><Trash2 size={12} /></button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 md:px-10 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label-mono flex items-center gap-3">
              <span>Local Model Interface</span>
              <HealthBadge endpoint="http://localhost:8000/v1/models" />
              {extracting && <span className="text-gold/70">· extracting facts…</span>}
            </div>
            <h1 className="serif italic text-3xl md:text-4xl gold-text">{current?.title || "Intelligence"}</h1>
          </div>
          <div className="flex items-center gap-1">
            {current && messages.length > 0 && (
              <button onClick={() => exportSession(current)} className="p-2 text-muted-foreground hover:text-gold transition-colors" title="Export as Markdown">
                <Download size={16} />
              </button>
            )}
            {!loading && messages.some((m) => m.role === "assistant") && (
              <button onClick={retry} className="p-2 text-muted-foreground hover:text-gold transition-colors" title="Retry last response">
                <RotateCcw size={16} />
              </button>
            )}
            <button onClick={clearChat} className="p-2 text-muted-foreground hover:text-foreground transition-colors" title="Clear conversation">
              <Trash2 size={16} />
            </button>
            <button onClick={() => setShowSettings((v) => !v)} className="p-2 text-muted-foreground hover:text-gold transition-colors" title="Settings">
              <Settings2 size={16} />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="mb-4 border border-border bg-card/40 rounded-sm p-4 space-y-3">
            <div>
              <div className="label-mono mb-1">Model name</div>
              <input value={model} onChange={(e) => setModel(e.target.value)} onBlur={persistSettings}
                className="w-full bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50"
                placeholder="deepseek-r1-distill-qwen-7b" />
            </div>
            <div>
              <div className="label-mono mb-1">System prompt</div>
              <textarea value={system} onChange={(e) => setSystem(e.target.value)} onBlur={persistSettings}
                rows={3} className="w-full bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50 resize-none" />
            </div>
            <p className="text-xs text-muted-foreground">
              Endpoint and API token are set via{" "}
              <code className="text-[0.75em] bg-background/60 px-1 py-0.5 rounded">MODEL_API_URL</code> /{" "}
              <code className="text-[0.75em] bg-background/60 px-1 py-0.5 rounded">MODEL_API_TOKEN</code> env vars — never stored in the browser.
            </p>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto border border-border bg-card/20 rounded-sm p-5 space-y-5">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center py-10">
              <div className="serif text-6xl text-gold/40 leading-none mb-4">&ldquo;</div>
              <p className="serif italic text-2xl md:text-3xl max-w-xl">
                Pose a question to your <span className="gold-text">local intelligence</span>.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">Model: <span className="text-gold/80">{model}</span></p>
              <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-lg">
                {PROMPT_SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => { setInput(s); void runChat(s); }}
                    className="text-xs border border-gold/30 text-gold/70 hover:border-gold/60 hover:text-gold hover:bg-gold/5 px-3 py-1.5 rounded-sm transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const isUser = m.role === "user";
            return (
              <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-4 py-3 rounded-sm text-sm ${
                  isUser
                    ? "bg-gold/10 border border-gold/30 text-foreground whitespace-pre-wrap"
                    : "bg-background/60 border border-border text-foreground/90"
                }`}>
                  <div className="label-mono mb-1.5 opacity-70 flex items-center justify-between gap-4">
                    <span>{isUser ? "You" : "Aethelgard"}</span>
                    {m.timestamp && <span className="opacity-50">{relativeTime(m.timestamp)}</span>}
                  </div>
                  {isUser ? m.content : (
                    <MessageContent
                      content={m.content}
                      streaming={loading && isLast}
                      sessionId={current?.id}
                      sessionTitle={current?.title}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {error && (
            <div className="border border-destructive/40 bg-destructive/10 text-destructive px-4 py-3 text-sm rounded-sm flex items-start justify-between gap-3">
              <span>{error}</span>
              <button onClick={retry} className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 border border-destructive/40 hover:bg-destructive/20">
                <RotateCcw size={12} /> Retry
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 border border-border bg-card/40 rounded-sm flex items-end gap-2 p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="Describe a thought, emotion, or interaction…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60 resize-none max-h-40"
          />
          {loading ? (
            <button onClick={stop} className="text-gold hover:opacity-80 p-2" title="Stop (Esc)"><Loader2 size={18} className="animate-spin" /></button>
          ) : (
            <button onClick={send} disabled={!input.trim()} className="text-gold hover:translate-x-0.5 transition-transform p-2 disabled:opacity-40" title="Send (Enter)">
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
