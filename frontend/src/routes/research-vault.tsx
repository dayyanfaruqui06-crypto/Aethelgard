import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { loadVault, removeFromVault, type VaultEntry } from "@/lib/sessions";
import { StructuredResponseCard } from "@/components/StructuredResponseCard";

export const Route = createFileRoute("/research-vault")({
  head: () => ({ meta: [{ title: "Research Vault — Aethelgard" }] }),
  component: ResearchVault,
});

function ResearchVault() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);

  useEffect(() => {
    const refresh = () => setEntries(loadVault());
    refresh();
    window.addEventListener("aethelgard:vault-updated", refresh);
    return () => window.removeEventListener("aethelgard:vault-updated", refresh);
  }, []);

  function handleRemove(id: string) {
    removeFromVault(id);
    setEntries(loadVault());
  }

  return (
    <div className="px-12 py-10 max-w-5xl mx-auto">
      <div className="mb-10">
        <div className="label-mono mb-2">Preserved Intelligence</div>
        <h1 className="serif italic text-5xl">Research Vault</h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Bookmarked responses, preserved with their full structure — facts, reasoning, and confidence intact.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="border border-border bg-card/30 rounded-sm p-12 text-center">
          <Bookmark size={32} className="text-gold/30 mx-auto mb-3" />
          <p className="serif italic text-xl">Your vault is empty.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Bookmark any structured response in{" "}
            <span className="text-gold/80">Intelligence</span> using the bookmark icon — it will be preserved here with full structure.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="label-mono text-muted-foreground mb-2">{entries.length} saved {entries.length === 1 ? "response" : "responses"}</div>
          {entries.map((entry) => (
            <StructuredResponseCard key={entry.id} entry={entry} onRemove={handleRemove} />
          ))}
        </div>
      )}
    </div>
  );
}
