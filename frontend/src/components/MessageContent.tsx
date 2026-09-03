import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronRight, Brain, ListChecks, Gauge,
  Lightbulb, Zap, Copy, Check, Bookmark, BookmarkCheck,
} from "lucide-react";
import { parseStructuredOutput, type ParsedOutput } from "@/lib/parseOutput";
import { saveToVault, loadVault, removeFromVault } from "@/lib/sessions";
import { useSettings } from "@/hooks/use-settings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useClipboard(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return { copied, copy };
}

function CopyBtn({ text, className = "" }: { text: string; className?: string }) {
  const { copied, copy } = useClipboard(text);
  return (
    <button
      onClick={copy}
      title="Copy to clipboard"
      className={`opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ${className}`}
    >
      {copied ? <Check size={11} className="text-gold" /> : <Copy size={11} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FactsBlock
// ---------------------------------------------------------------------------

function FactsBlock({ facts }: { facts: string[] }) {
  const [open, setOpen] = useState(true);
  const text = facts.map((f) => `• ${f}`).join("\n");
  return (
    <div className="border border-border/60 bg-background/40 rounded-sm group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer label-mono text-gold/80 hover:text-gold transition-colors"
      >
        <ChevronRight size={12} className={`transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`} />
        <ListChecks size={12} />
        <span>Facts</span>
        <span className="text-[0.55rem] opacity-50 ml-1">· explicitly stated · no assumptions</span>
        <span className="ml-auto text-[0.55rem] opacity-50">{facts.length}</span>
        <CopyBtn text={text} />
      </div>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-1.5">
          {facts.map((f, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs text-foreground/80 leading-relaxed">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-gold/50 flex-shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReasoningBlock
// ---------------------------------------------------------------------------

function ReasoningBlock({
  reasoning,
  highlight,
  streaming,
}: {
  reasoning: string;
  highlight: string;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const beforeHighlight = highlight ? reasoning.slice(0, reasoning.indexOf(highlight)).trim() : "";
  const afterHighlight  = highlight ? reasoning.slice(reasoning.indexOf(highlight) + highlight.length).trim() : "";

  return (
    <div className="border border-border/60 bg-background/40 rounded-sm group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer label-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight size={12} className={`transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`} />
        <Brain size={12} />
        <span>Reasoning</span>
        {streaming && <span className="text-[0.55rem] opacity-60 ml-1">· thinking…</span>}
        <CopyBtn text={reasoning} className="ml-auto" />
      </div>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50 text-xs text-muted-foreground leading-relaxed">
          {highlight ? (
            <div className="space-y-1.5">
              {beforeHighlight && <p className="whitespace-pre-wrap">{beforeHighlight}</p>}
              <blockquote className="border-l-2 border-gold/40 pl-3 italic text-foreground/80">
                {highlight}
              </blockquote>
              {afterHighlight && <p className="whitespace-pre-wrap">{afterHighlight}</p>}
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{reasoning}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OtherExplanationsBlock
// ---------------------------------------------------------------------------

function OtherExplanationsBlock({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const text = items.join("\n");
  return (
    <div className="border border-border/60 bg-background/40 rounded-sm group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer label-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight size={12} className={`transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`} />
        <Lightbulb size={12} />
        <span>Other possible explanations</span>
        <span className="ml-auto text-[0.55rem] opacity-50">{items.length}</span>
        <CopyBtn text={text} />
      </div>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfidenceBlock
// ---------------------------------------------------------------------------

function ConfidenceBlock({ confidence }: { confidence: NonNullable<ParsedOutput["confidence"]> }) {
  const [open, setOpen] = useState(false);
  const pct = Math.min(100, Math.max(0, confidence.level));
  return (
    <div className="border border-border/60 bg-background/40 rounded-sm group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer label-mono text-gold/80 hover:text-gold transition-colors"
      >
        <ChevronRight size={12} className={`transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`} />
        <Gauge size={12} />
        <span>Confidence</span>
        <span className="ml-2 text-[0.55rem] text-gold/70">{confidence.label}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-16 h-[3px] bg-border rounded-full overflow-hidden">
            <div className="h-full bg-gold/70 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      {open && confidence.note && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50 text-xs text-muted-foreground leading-relaxed italic">
          {confidence.note}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InPracticeBlock
// ---------------------------------------------------------------------------

function InPracticeBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border/60 bg-background/40 rounded-sm group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer label-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight size={12} className={`transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`} />
        <Zap size={12} />
        <span>In practice</span>
        <CopyBtn text={text} className="ml-auto" />
      </div>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50 text-xs text-muted-foreground leading-relaxed italic">
          {text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnswerBlock
// ---------------------------------------------------------------------------

function AnswerBlock({ answer }: { answer: string }) {
  if (!answer.trim()) return null;
  return (
    <div className="prose-aethelgard text-sm leading-relaxed text-foreground/90 pt-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p:          ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul:         ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
          ol:         ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>,
          li:         ({ children }) => <li className="marker:text-gold/60">{children}</li>,
          h1:         ({ children }) => <h3 className="serif italic text-xl mt-3 mb-2 gold-text">{children}</h3>,
          h2:         ({ children }) => <h3 className="serif italic text-lg mt-3 mb-2 gold-text">{children}</h3>,
          h3:         ({ children }) => <h4 className="serif italic text-base mt-3 mb-1.5 text-foreground">{children}</h4>,
          strong:     ({ children }) => <strong className="text-foreground">{children}</strong>,
          em:         ({ children }) => <em className="italic text-foreground/95">{children}</em>,
          a:          ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-gold underline-offset-2 hover:underline">
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className || "");
            if (isBlock) {
              return (
                <pre className="my-3 bg-background/70 border border-border rounded-sm p-3 overflow-x-auto text-xs">
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className="bg-background/70 border border-border/70 px-1 py-0.5 rounded-sm text-[0.8em]">
                {children}
              </code>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-gold/50 pl-3 italic text-foreground/80 my-2">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border" />,
        }}
      >
        {answer}
      </ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookmarkBtn
// ---------------------------------------------------------------------------

function BookmarkBtn({
  content,
  sessionId,
  sessionTitle,
  parsed,
}: {
  content: string;
  sessionId?: string;
  sessionTitle?: string;
  parsed: ParsedOutput;
}) {
  const [saved, setSaved] = useState(() => loadVault().some((e) => e.rawContent === content));

  const toggle = () => {
    if (saved) {
      const entry = loadVault().find((e) => e.rawContent === content);
      if (entry) removeFromVault(entry.id);
      setSaved(false);
    } else {
      saveToVault({
        sessionId:    sessionId ?? "unknown",
        sessionTitle: sessionTitle ?? "Untitled",
        parsed,
        rawContent:   content,
      });
      setSaved(true);
    }
  };

  return (
    <button
      onClick={toggle}
      title={saved ? "Remove from Research Vault" : "Save to Research Vault"}
      className="p-1 text-muted-foreground hover:text-gold transition-colors"
    >
      {saved ? <BookmarkCheck size={13} className="text-gold" /> : <Bookmark size={13} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function MessageContent({
  content,
  streaming = false,
  sessionId,
  sessionTitle,
}: {
  content: string;
  streaming?: boolean;
  sessionId?: string;
  sessionTitle?: string;
}) {
  const { autoVault } = useSettings();
  const parsed = useMemo(() => parseStructuredOutput(content), [content]);

  // Auto-vault: bookmark automatically when a structured response finishes
  useEffect(() => {
    if (streaming) return;
    if (!parsed.isStructured) return;
    if (!autoVault) return;
    if (loadVault().some((e) => e.rawContent === content)) return;
    saveToVault({
      sessionId:    sessionId ?? "unknown",
      sessionTitle: sessionTitle ?? "Untitled",
      parsed,
      rawContent:   content,
    });
  }, [streaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect in-progress <think> block during streaming
  const streamingReasoning = useMemo(() => {
    if (!streaming) return undefined;
    const open  = content.lastIndexOf("<think>");
    if (open === -1) return undefined;
    const close = content.indexOf("</think>", open);
    if (close !== -1) return undefined;
    return content.slice(open + 7);
  }, [content, streaming]);

  if (!parsed.isStructured && !streamingReasoning) {
    return (
      <div className="space-y-3">
        {parsed.answer && <AnswerBlock answer={parsed.answer} />}
        {streaming && <span className="inline-block w-[2px] h-4 align-middle bg-gold animate-pulse" />}
        {!parsed.answer && !streaming && (
          <span className="text-muted-foreground italic">No response.</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* In-progress <think> block during streaming */}
      {streamingReasoning !== undefined && (
        <div className="border border-border/60 bg-background/40 rounded-sm">
          <div className="flex items-center gap-2 px-3 py-2 label-mono text-gold/80">
            <Brain size={12} />
            <span>Reasoning</span>
            <span className="text-[0.55rem] opacity-60">· thinking…</span>
          </div>
          <div className="px-4 pb-3 pt-1 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed border-t border-border/50 italic">
            {streamingReasoning}
          </div>
        </div>
      )}

      {parsed.facts.length > 0 && <FactsBlock facts={parsed.facts} />}

      {parsed.reasoning && (
        <ReasoningBlock
          reasoning={parsed.reasoning}
          highlight={parsed.reasoningHighlight}
          streaming={streaming && streamingReasoning !== undefined}
        />
      )}

      {parsed.otherExplanations.length > 0 && (
        <OtherExplanationsBlock items={parsed.otherExplanations} />
      )}

      {parsed.confidence && <ConfidenceBlock confidence={parsed.confidence} />}

      {parsed.inPractice && <InPracticeBlock text={parsed.inPractice} />}

      {parsed.answer && <AnswerBlock answer={parsed.answer} />}

      {streaming && !streamingReasoning && (
        <span className="inline-block w-[2px] h-4 align-middle bg-gold animate-pulse" />
      )}

      {!streaming && parsed.isStructured && (
        <div className="flex justify-end mt-1">
          <BookmarkBtn
            content={content}
            sessionId={sessionId}
            sessionTitle={sessionTitle}
            parsed={parsed}
          />
        </div>
      )}
    </div>
  );
}
