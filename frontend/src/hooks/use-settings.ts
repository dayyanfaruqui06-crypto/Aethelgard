/**
 * useSettings — reads persisted UI preferences from localStorage
 * and re-renders on every "aethelgard:settings-updated" event.
 *
 * Preferences:
 *   aethelgard.serif       (bool, default true)  — use Cormorant Garamond for headings
 *   aethelgard.autovault   (bool, default true)  — auto-bookmark structured responses
 *   aethelgard.model       (string)              — model name
 *   aethelgard.system      (string)              — system prompt
 */

import { useEffect, useState } from "react";

export type Settings = {
  serifDisplay: boolean;
  autoVault: boolean;
  model: string;
  system: string;
};

const DEFAULTS: Settings = {
  serifDisplay: true,
  autoVault: true,
  model:
    (import.meta.env.VITE_MODEL_NAME as string | undefined)?.trim() ||
    "deepseek-r1-distill-qwen-7b",
  system:
    "You are Aethelgard, an elite research intelligence assistant. Respond with clarity, restraint, and intellectual depth.",
};

function readSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  return {
    serifDisplay: localStorage.getItem("aethelgard.serif") !== "false",
    autoVault: localStorage.getItem("aethelgard.autovault") !== "false",
    model: localStorage.getItem("aethelgard.model") || DEFAULTS.model,
    system: localStorage.getItem("aethelgard.system") || DEFAULTS.system,
  };
}

export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(readSettings);

  useEffect(() => {
    const handler = () => setSettings(readSettings());
    window.addEventListener("aethelgard:settings-updated", handler);
    return () => window.removeEventListener("aethelgard:settings-updated", handler);
  }, []);

  return settings;
}
