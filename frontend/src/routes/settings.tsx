import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Aethelgard" }] }),
  component: SettingsPage,
});

const DEFAULT_MODEL =
  (import.meta.env.VITE_MODEL_NAME as string | undefined)?.trim() ||
  "deepseek-r1-distill-qwen-7b";

const DEFAULT_SYSTEM =
  "You are Aethelgard, an elite research intelligence assistant. Respond with clarity, restraint, and intellectual depth.";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-10 h-5 rounded-full p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-gold/50 ${on ? "bg-gold/80" : "bg-muted"}`}
    >
      <div className={`w-4 h-4 rounded-full bg-background shadow-sm transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function Row({ label, desc, control }: { label: string; desc: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-5 border-b border-border last:border-0">
      <div>
        <div className="serif text-lg">{label}</div>
        <div className="text-sm text-muted-foreground mt-0.5 max-w-sm">{desc}</div>
      </div>
      <div className="ml-6 shrink-0">{control}</div>
    </div>
  );
}

function SettingsPage() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [system, setSystem] = useState(DEFAULT_SYSTEM);
  const [saved, setSaved] = useState(false);
  const [autoVault, setAutoVault] = useState(true);
  const [serifDisplay, setSerifDisplay] = useState(true);

  useEffect(() => {
    setModel(localStorage.getItem("aethelgard.model") || DEFAULT_MODEL);
    const s = localStorage.getItem("aethelgard.system");
    if (s) setSystem(s);
    setAutoVault(localStorage.getItem("aethelgard.autovault") !== "false");
    setSerifDisplay(localStorage.getItem("aethelgard.serif") !== "false");
  }, []);

  // Apply serif toggle immediately to the document
  useEffect(() => {
    document.documentElement.classList.toggle("no-serif", !serifDisplay);
  }, [serifDisplay]);

  function save() {
    localStorage.setItem("aethelgard.model", model);
    localStorage.setItem("aethelgard.system", system);
    localStorage.setItem("aethelgard.autovault", String(autoVault));
    localStorage.setItem("aethelgard.serif", String(serifDisplay));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    window.dispatchEvent(new CustomEvent("aethelgard:settings-updated"));
  }

  return (
    <div className="px-12 py-10 max-w-3xl mx-auto">
      <div className="mb-10">
        <div className="label-mono mb-2">Console Configuration</div>
        <h1 className="serif italic text-5xl">Settings</h1>
      </div>

      {/* Model */}
      <section className="border border-border bg-card/30 px-6 mb-6">
        <div className="label-mono pt-5 pb-3 border-b border-border">Cognition Engine</div>

        <div className="py-4 border-b border-border space-y-2">
          <div className="serif text-lg">Model name</div>
          <div className="text-sm text-muted-foreground">Exact model string passed in API requests.</div>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50"
            placeholder="deepseek-r1-distill-qwen-7b"
          />
        </div>

        <div className="py-4 border-b border-border space-y-2">
          <div className="serif text-lg">System prompt</div>
          <div className="text-sm text-muted-foreground">Defines the model's disposition across all sessions.</div>
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            rows={4}
            className="w-full bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50 resize-none"
          />
        </div>

        <div className="py-4 space-y-1">
          <div className="serif text-lg">Connection</div>
          <p className="text-sm text-muted-foreground">
            Endpoint and API token are configured via{" "}
            <code className="text-xs bg-background/70 border border-border px-1 py-0.5 rounded">MODEL_API_URL</code> and{" "}
            <code className="text-xs bg-background/70 border border-border px-1 py-0.5 rounded">MODEL_API_TOKEN</code>{" "}
            environment variables on the server — they are never stored in the browser.
          </p>
        </div>
      </section>

      {/* Interface */}
      <section className="border border-border bg-card/30 px-6 mb-6">
        <div className="label-mono pt-5 pb-2">Interface</div>
        <Row
          label="Serif Display"
          desc="Use Cormorant Garamond for headings and large text across the whole UI."
          control={
            <Toggle
              on={serifDisplay}
              onChange={(v) => { setSerifDisplay(v); }}
              label="Toggle serif display"
            />
          }
        />
        <Row
          label="Auto-Vaulting"
          desc="Automatically bookmark every structured response (Facts / Reasoning / Confidence) to Research Vault after it completes."
          control={
            <Toggle
              on={autoVault}
              onChange={setAutoVault}
              label="Toggle auto-vaulting"
            />
          }
        />
      </section>

      <button
        onClick={save}
        className="flex items-center gap-2 border border-gold/60 text-gold hover:bg-gold/10 transition-colors px-6 py-3 text-xs tracking-[0.2em] uppercase"
      >
        {saved ? <><Check size={14} /> Saved</> : "Save Settings"}
      </button>
    </div>
  );
}
