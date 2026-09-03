import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSessions } from "@/lib/sessions";

export const Route = createFileRoute("/historical-context")({
  head: () => ({ meta: [{ title: "Historical Context — Aethelgard" }] }),
  component: History,
});

const STATIC_EVENTS = [
  { year: "1789", title: "The Rupture of Inherited Authority", note: "A study in the disintegration of vertical legitimacy." },
  { year: "1848", title: "Year of Pamphlets", note: "Print as catalyst — the velocity of consensus." },
  { year: "1918", title: "Aftermath & Anatomy", note: "Trauma codified in literature and treaty." },
  { year: "1968", title: "The Long Refusal", note: "Generational disinheritance, sustained." },
  { year: "1991", title: "Frames Dissolve", note: "The ideological binary unbinds." },
  { year: "2024", title: "Synthetic Memory", note: "Recollection mediated through computation." },
];

function History() {
  const [sessionEvents, setSessionEvents] = useState<{ year: string; title: string; note: string }[]>([]);

  useEffect(() => {
    const refresh = () => {
      const sessions = loadSessions();
      // Pull historical summaries from sessions that have them
      const derived = sessions
        .filter((s) => s.summary?.historical?.trim())
        .map((s) => ({
          year: new Date(s.updatedAt).getFullYear().toString(),
          title: s.title || "Untitled inquiry",
          note: s.summary!.historical!.trim(),
        }));
      setSessionEvents(derived);
    };
    refresh();
    window.addEventListener("aethelgard:sessions-updated", refresh);
    return () => window.removeEventListener("aethelgard:sessions-updated", refresh);
  }, []);

  const all = [...sessionEvents, ...STATIC_EVENTS].sort((a, b) =>
    parseInt(a.year) - parseInt(b.year)
  );

  return (
    <div className="px-12 py-10 max-w-4xl mx-auto">
      <div className="mb-12">
        <div className="label-mono mb-2">Background Strata</div>
        <h1 className="serif italic text-5xl">Historical Context</h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Structural events and your session-derived historical insights, arranged chronologically.
        </p>
      </div>

      <div className="relative pl-8 border-l border-gold/30">
        {all.map((e, i) => {
          const isFromSession = i < sessionEvents.length;
          return (
            <div key={i} className="relative mb-10 last:mb-0">
              <span
                className={`absolute -left-[37px] top-2 w-2.5 h-2.5 rounded-full ${
                  isFromSession
                    ? "bg-gold shadow-[0_0_16px_oklch(0.78_0.11_80/0.8)]"
                    : "bg-gold/60 shadow-[0_0_12px_oklch(0.78_0.11_80/0.6)]"
                }`}
              />
              <div className="flex items-center gap-3 mb-1">
                <div className="label-mono text-gold/80">{e.year}</div>
                {isFromSession && (
                  <span className="text-[0.55rem] label-mono text-gold/60 border border-gold/30 px-2 py-0.5">
                    Your research
                  </span>
                )}
              </div>
              <h3 className="serif text-2xl">{e.title}</h3>
              <p className="mt-2 text-muted-foreground italic">{e.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
