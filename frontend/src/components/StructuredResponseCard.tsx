import { useState } from "react";
import { ListChecks, Brain, Gauge, Lightbulb, Zap, ChevronRight, Trash2 } from "lucide-react";
import type { VaultEntry } from "@/lib/sessions";

function FactsList({ facts }: { facts: string[] }) {
  return (
    <div className="space-y-1.5">
      {facts.map((f, i) => (
        <div key={i} className="flex items-start gap-2.5 text-xs text-foreground/80 leading-relaxed">
          <span className="mt-1.5 w-1 h-1 rounded-full bg-gold/50 flex-shrink-0" />
          <span>{f}</span>
        </div>
      ))}
    </div>
  );
}

function OtherList({ items }: { items: string[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2.5 text-xs text-foreground/75 leading-relaxed">
          <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

export function StructuredResponseCard({
  entry,
  onRemove,
}: {
  entry: VaultEntry;
  onRemove?: (id: string) => void;
}) {
  const [reasoningOpen,    setReasoningOpen]    = useState(false);
  const [otherOpen,        setOtherOpen]        = useState(false);
  const [confidenceOpen,   setConfidenceOpen]   = useState(false);
  const [inPracticeOpen,   setInPracticeOpen]   = useState(false);
  const { parsed } = entry;

  const savedDate = new Date(entry.savedAt).toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  });

  return (
    <div className="border border-border bg-card/30 rounded-sm p-5 space-y-4 group/card">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="serif italic text-lg gold-text leading-tight">{entry.sessionTitle}</div>
          <div className="label-mono mt-1">{savedDate} · {parsed.facts.length} facts</div>
        </div>
        {onRemove && (
          <button
            onClick={() => onRemove(entry.id)}
            className="opacity-0 group-hover/card:opacity-50 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-destructive mt-0.5"
            title="Remove from vault"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Facts */}
      {parsed.facts.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 label-mono text-gold/80 mb-2">
            <ListChecks size={11} />
            <span>Facts</span>
          </div>
          <FactsList facts={parsed.facts} />
        </div>
      )}

      <div className="border-t border-border/50" />

      {/* Reasoning */}
      {parsed.reasoning && (
        <div>
          <button
            onClick={() => setReasoningOpen((v) => !v)}
            className="flex items-center gap-1.5 label-mono text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <ChevronRight size={11} className={`transition-transform ${reasoningOpen ? "rotate-90" : ""}`} />
            <Brain size={11} />
            <span>Reasoning</span>
          </button>
          {reasoningOpen && (
            <div className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap pl-4">
              {parsed.reasoningHighlight ? (
                <>
                  <p>{parsed.reasoning.slice(0, parsed.reasoning.indexOf(parsed.reasoningHighlight)).trim()}</p>
                  <blockquote className="border-l-2 border-gold/40 pl-3 italic text-foreground/80 my-1.5">
                    {parsed.reasoningHighlight}
                  </blockquote>
                  <p>{parsed.reasoning.slice(parsed.reasoning.indexOf(parsed.reasoningHighlight) + parsed.reasoningHighlight.length).trim()}</p>
                </>
              ) : (
                <p>{parsed.reasoning}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Other possible explanations */}
      {parsed.otherExplanations && parsed.otherExplanations.length > 0 && (
        <div>
          <button
            onClick={() => setOtherOpen((v) => !v)}
            className="flex items-center gap-1.5 label-mono text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <ChevronRight size={11} className={`transition-transform ${otherOpen ? "rotate-90" : ""}`} />
            <Lightbulb size={11} />
            <span>Other possible explanations</span>
            <span className="ml-auto text-[0.55rem] opacity-50">{parsed.otherExplanations.length}</span>
          </button>
          {otherOpen && (
            <div className="mt-2 pl-4">
              <OtherList items={parsed.otherExplanations} />
            </div>
          )}
        </div>
      )}

      {/* Confidence */}
      {parsed.confidence && (
        <div>
          <button
            onClick={() => setConfidenceOpen((v) => !v)}
            className="flex items-center gap-1.5 label-mono text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <ChevronRight size={11} className={`transition-transform ${confidenceOpen ? "rotate-90" : ""}`} />
            <Gauge size={11} />
            <span>Confidence</span>
            <span className="ml-2 text-[0.55rem] text-gold/70">{parsed.confidence.label}</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-14 h-[3px] bg-border rounded-full overflow-hidden">
                <div className="h-full bg-gold/70 rounded-full" style={{ width: `${parsed.confidence.level}%` }} />
              </div>
            </div>
          </button>
          {confidenceOpen && parsed.confidence.note && (
            <div className="mt-2 text-xs text-muted-foreground leading-relaxed italic pl-4">
              {parsed.confidence.note}
            </div>
          )}
        </div>
      )}

      {/* In practice */}
      {parsed.inPractice && (
        <div>
          <button
            onClick={() => setInPracticeOpen((v) => !v)}
            className="flex items-center gap-1.5 label-mono text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <ChevronRight size={11} className={`transition-transform ${inPracticeOpen ? "rotate-90" : ""}`} />
            <Zap size={11} />
            <span>In practice</span>
          </button>
          {inPracticeOpen && (
            <div className="mt-2 text-xs text-muted-foreground leading-relaxed italic pl-4">
              {parsed.inPractice}
            </div>
          )}
        </div>
      )}

      {/* Answer */}
      {parsed.answer && (
        <>
          <div className="border-t border-border/50" />
          <p className="text-sm text-foreground/80 leading-relaxed">{parsed.answer}</p>
        </>
      )}
    </div>
  );
}
