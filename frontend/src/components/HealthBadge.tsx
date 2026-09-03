import { useEffect, useState } from "react";

type Status = "checking" | "online" | "offline";

export function HealthBadge({
  endpoint = "http://localhost:8000/v1/models",
  token,
}: {
  endpoint?: string;
  token?: string;
}) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setStatus("checking");
    const headers: Record<string, string> = {};
    if (token?.trim()) headers["Authorization"] = `Bearer ${token.trim()}`;
    const probe = async () => {
      try {
        const r = await fetch(endpoint, { method: "GET", headers, signal: ctrl.signal });
        if (!cancelled) setStatus(r.ok ? "online" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };
    void probe();
    const id = window.setInterval(() => void probe(), 15_000);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [endpoint, token]);

  const label =
    status === "online"
      ? "Cognition engine online"
      : status === "offline"
      ? "Engine offline"
      : "Probing engine…";

  return (
    <div className="flex items-center gap-2 label-mono text-[0.6rem]" title={label}>
      <span className="relative flex items-center justify-center w-3 h-3">
        {status === "online" && (
          <span
            className="absolute inline-flex w-full h-full rounded-full opacity-50 animate-ping"
            style={{ backgroundColor: "var(--gold)" }}
          />
        )}
        <span
          className="relative inline-flex w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor:
              status === "online"
                ? "var(--gold)"
                : status === "offline"
                ? "var(--destructive)"
                : "var(--muted-foreground)",
          }}
        />
      </span>
      <span className="opacity-80">{label}</span>
    </div>
  );
}
