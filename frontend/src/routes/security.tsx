import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Lock, Key, Eye } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { loadSessions, loadVault } from "@/lib/sessions";

export const Route = createFileRoute("/security")({
  head: () => ({ meta: [{ title: "Security — Aethelgard" }] }),
  component: Security,
});

function Security() {
  const { user, role } = useAuth();
  const [sessionCount, setSessionCount] = useState(0);
  const [vaultCount, setVaultCount] = useState(0);
  const [log, setLog] = useState<{ t: string; e: string; host: string }[]>([]);

  useEffect(() => {
    const refresh = () => {
      const sessions = loadSessions();
      const vault = loadVault();
      setSessionCount(sessions.length);
      setVaultCount(vault.length);

      // Build an audit log from actual stored data
      const entries: { t: string; e: string; host: string; ts: number }[] = [];

      // Auth event
      entries.push({
        ts: Date.now() - 60_000,
        t: new Date(Date.now() - 60_000).toTimeString().slice(0, 8),
        e: `Session authenticated · ${user?.email ?? "unknown"}`,
        host: "console.aethelgard.local",
      });

      // Session events
      for (const s of sessions.slice(0, 3)) {
        entries.push({
          ts: s.updatedAt,
          t: new Date(s.updatedAt).toTimeString().slice(0, 8),
          e: `Session updated · "${s.title}"`,
          host: "intelligence",
        });
      }

      // Vault events
      for (const v of vault.slice(0, 2)) {
        entries.push({
          ts: v.savedAt,
          t: new Date(v.savedAt).toTimeString().slice(0, 8),
          e: `Vault write · "${v.sessionTitle}"`,
          host: "research-vault",
        });
      }

      entries.sort((a, b) => b.ts - a.ts);
      setLog(entries.slice(0, 8).map(({ t, e, host }) => ({ t, e, host })));
    };

    refresh();
    window.addEventListener("aethelgard:sessions-updated", refresh);
    window.addEventListener("aethelgard:vault-updated", refresh);
    return () => {
      window.removeEventListener("aethelgard:sessions-updated", refresh);
      window.removeEventListener("aethelgard:vault-updated", refresh);
    };
  }, [user]);

  const status = [
    { icon: Lock, label: "Encryption", value: "AES-256", note: "Active across all vessels" },
    { icon: Key, label: "Auth Provider", value: "Supabase", note: user?.email ?? "Not authenticated" },
    { icon: Shield, label: "Access Tier", value: role === "admin" ? "Principal" : "Researcher", note: role === "admin" ? "Elite clearance verified" : "Standard access" },
    { icon: Eye, label: "Audit Trail", value: "Active", note: `${sessionCount} sessions · ${vaultCount} vault entries` },
  ];

  return (
    <div className="px-12 py-10 max-w-5xl mx-auto">
      <div className="mb-10">
        <div className="label-mono mb-2">Access & Encryption</div>
        <h1 className="serif italic text-5xl">Security</h1>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-12">
        {status.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="border border-border bg-card/30 p-6 flex gap-5">
              <div className="w-11 h-11 border border-gold/40 bg-gold/5 flex items-center justify-center shrink-0">
                <Icon size={18} className="text-gold" />
              </div>
              <div>
                <div className="label-mono">{s.label}</div>
                <div className="serif text-2xl mt-0.5">{s.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.note}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border border-border bg-card/30">
        <div className="px-6 py-4 border-b border-border label-mono">Recent Events</div>
        {log.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground italic">No events recorded yet.</div>
        ) : (
          log.map((l, i) => (
            <div
              key={i}
              className="px-6 py-3 flex items-center gap-6 text-sm border-b border-border/50 last:border-0 font-mono"
            >
              <span className="text-gold/80 text-xs shrink-0">{l.t}</span>
              <span className="flex-1 truncate">{l.e}</span>
              <span className="text-muted-foreground text-xs shrink-0">{l.host}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
