import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Sparkles, Download, Loader2 } from "lucide-react";
import { loadSessions, loadVault, type Session, type VaultEntry } from "@/lib/sessions";

export const Route = createFileRoute("/synthesis")({
  head: () => ({ meta: [{ title: "Synthesis — Aethelgard" }] }),
  component: Synthesis,
});

function Synthesis() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [vault, setVault] = useState<VaultEntry[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setSessions(loadSessions());
      setVault(loadVault());
    };
    refresh();
    window.addEventListener("aethelgard:sessions-updated", refresh);
    window.addEventListener("aethelgard:vault-updated", refresh);
    return () => {
      window.removeEventListener("aethelgard:sessions-updated", refresh);
      window.removeEventListener("aethelgard:vault-updated", refresh);
    };
  }, []);

  // Build synthesis entries from sessions that have summaries
  const reports = sessions
    .filter((s) => s.summary?.synthesis)
    .map((s) => ({
      id: s.id,
      title: s.title || "Untitled",
      date: new Date(s.updatedAt).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      }),
      words: Math.round(
        s.messages.filter((m) => m.role === "assistant").reduce((n, m) => n + m.content.split(/\s+/).length, 0)
      ).toLocaleString(),
      status: "Final" as string,
      synthesis: s.summary!.synthesis,
      factCount: s.facts.length,
    }));

  function download(title: string, synthesis: string) {
    const blob = new Blob([synthesis], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}_synthesis.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-12 py-10 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="label-mono mb-2">Compiled Outputs</div>
          <h1 className="serif italic text-5xl">Synthesis</h1>
          <p className="mt-3 text-muted-foreground max-w-xl">
            Refined intelligence drawn from your research sessions — each argument distilled from facts and reasoning.
          </p>
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 border border-gold/50 text-gold px-4 py-2.5 text-xs tracking-[0.2em] uppercase hover:bg-gold/10"
        >
          <Sparkles size={14} /> New Session
        </Link>
      </div>

      {reports.length === 0 ? (
        <div className="border border-border bg-card/30 rounded-sm p-12 text-center">
          <div className="serif text-5xl text-gold/40 mb-3">∅</div>
          <p className="serif italic text-xl">No synthesis compiled yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Complete conversations in{" "}
            <Link to="/" className="text-gold/80 hover:text-gold">Intelligence</Link>{" "}
            — summaries will appear here once facts are extracted.
          </p>
        </div>
      ) : (
        <div className="border border-border">
          {reports.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-start gap-5 px-6 py-5 hover:bg-card/50 transition-colors ${
                i !== 0 ? "border-t border-border" : ""
              }`}
            >
              <FileText size={18} className="text-gold/70 shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <div className="serif text-xl">{r.title}</div>
                <div className="label-mono mt-1">{r.date} · {r.words} words · {r.factCount} facts</div>
                {r.synthesis && (
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-2">
                    {r.synthesis}
                  </p>
                )}
              </div>
              <span className="label-mono text-gold/80 shrink-0 mt-1">{r.status}</span>
              <button
                onClick={() => download(r.title, r.synthesis)}
                className="text-muted-foreground hover:text-gold transition-colors mt-1 shrink-0"
                title="Download synthesis"
              >
                {generating === r.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {vault.length > 0 && (
        <div className="mt-12">
          <div className="label-mono mb-4">From Research Vault</div>
          <div className="border border-border">
            {vault.slice(0, 5).map((v, i) => (
              <div
                key={v.id}
                className={`flex items-start gap-5 px-6 py-4 hover:bg-card/50 transition-colors ${
                  i !== 0 ? "border-t border-border" : ""
                }`}
              >
                <FileText size={16} className="text-gold/50 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{v.sessionTitle}</div>
                  <div className="label-mono text-[0.6rem] mt-0.5">
                    {v.parsed.facts.length} facts ·{" "}
                    {new Date(v.savedAt).toLocaleDateString("en-GB")}
                  </div>
                  {v.parsed.reasoning && (
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2 italic">
                      {v.parsed.reasoning.slice(0, 200)}…
                    </p>
                  )}
                </div>
                <button
                  onClick={() => download(v.sessionTitle, v.parsed.reasoning)}
                  className="text-muted-foreground hover:text-gold transition-colors mt-0.5 shrink-0"
                >
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
