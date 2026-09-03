import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, MessageSquare, ExternalLink } from "lucide-react";
import { loadSessions, type Session } from "@/lib/sessions";

export const Route = createFileRoute("/archives")({
  head: () => ({ meta: [{ title: "Archives — Aethelgard" }] }),
  component: Archives,
});

function Archives() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const refresh = () => setSessions(loadSessions());
    refresh();
    window.addEventListener("aethelgard:sessions-updated", refresh);
    return () => window.removeEventListener("aethelgard:sessions-updated", refresh);
  }, []);

  const filtered = sessions.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.topic.toLowerCase().includes(q) ||
      s.facts.some((f) => f.text.toLowerCase().includes(q))
    );
  });

  return (
    <div className="px-12 py-10 max-w-6xl mx-auto">
      <div className="mb-10">
        <div className="label-mono mb-2">Sealed Records</div>
        <h1 className="serif italic text-5xl">Archives</h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          All research sessions, searchable by title, topic, or extracted facts.
        </p>
      </div>

      <div className="flex items-center gap-3 border border-border bg-card/40 px-4 py-3 mb-8">
        <Search size={16} className="text-muted-foreground flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions, topics, facts…"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground text-xs">
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="border border-border bg-card/30 rounded-sm p-12 text-center">
          <div className="serif text-5xl text-gold/40 mb-3">∅</div>
          <p className="serif italic text-xl">
            {sessions.length === 0 ? "No sessions archived yet." : "No sessions match your search."}
          </p>
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              Start a conversation in <span className="text-gold/80">Intelligence</span> — sessions are automatically archived here.
            </p>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((s) => {
            const msgCount = s.messages.filter((m) => m.role !== "system").length;
            const date = new Date(s.updatedAt).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            });
            return (
              <Link
                key={s.id}
                to="/"
                onClick={() => {
                  const { setCurrentSessionId } = require("@/lib/sessions");
                  setCurrentSessionId(s.id);
                }}
                className="text-left border border-border bg-card/30 hover:border-gold/40 hover:bg-card/60 transition-all p-6 group block"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="label-mono text-gold/70 truncate max-w-[60%]">{s.id.slice(0, 18)}</span>
                  <span className="label-mono">{date}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="serif text-2xl group-hover:gold-text transition-all">{s.title || "Untitled"}</h3>
                  <ExternalLink size={14} className="text-muted-foreground mt-1.5 flex-shrink-0 opacity-0 group-hover:opacity-60" />
                </div>
                <div className="flex items-center gap-3 label-mono mt-4 text-muted-foreground">
                  <span className="flex items-center gap-1"><MessageSquare size={11} /> {msgCount} messages</span>
                  <span>·</span>
                  <span>{s.facts.length} facts extracted</span>
                </div>
                {s.facts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.facts.slice(0, 3).map((f) => (
                      <span key={f.id} className="text-[0.6rem] px-2 py-0.5 border border-border/60 text-muted-foreground rounded-sm truncate max-w-[200px]">
                        {f.text}
                      </span>
                    ))}
                    {s.facts.length > 3 && (
                      <span className="text-[0.6rem] px-2 py-0.5 text-gold/50">+{s.facts.length - 3} more</span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
