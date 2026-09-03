import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Aethelgard" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === "signup" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) setError(error.message);
      else navigate({ to: "/", replace: true });
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setBusy(false);
      if (error) setError(error.message);
      else setSuccess("Account created. Check your email to confirm, then sign in.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{ backgroundImage: "radial-gradient(circle at 50% 30%, var(--gold) 0%, transparent 60%)" }}
      />
      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-sm border border-gold/40 bg-gold/5 items-center justify-center mb-4">
            <Shield size={20} className="text-gold" />
          </div>
          <div className="serif italic text-3xl gold-text">Aethelgard</div>
          <div className="label-mono mt-2">{mode === "login" ? "Restricted Access" : "Create Account"}</div>
        </div>

        {/* Mode toggle */}
        <div className="flex mb-4 border border-border rounded-sm overflow-hidden">
          <button
            onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
            className={`flex-1 py-2 text-xs tracking-[0.2em] uppercase transition-colors ${mode === "login" ? "bg-gold/10 text-gold" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode("signup"); setError(null); setSuccess(null); }}
            className={`flex-1 py-2 text-xs tracking-[0.2em] uppercase transition-colors ${mode === "signup" ? "bg-gold/10 text-gold" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 border border-border bg-card/40 p-6 rounded-sm">
          <div>
            <div className="label-mono mb-1">Email</div>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50"
            />
          </div>
          <div>
            <div className="label-mono mb-1">Password</div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50"
            />
          </div>
          {mode === "signup" && (
            <div>
              <div className="label-mono mb-1">Confirm Password</div>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50"
              />
            </div>
          )}
          {error && (
            <div className="border border-destructive/40 bg-destructive/10 text-destructive text-xs px-3 py-2 rounded-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="border border-green-500/40 bg-green-500/10 text-green-400 text-xs px-3 py-2 rounded-sm">
              {success}
            </div>
          )}
          <button
            disabled={busy}
            type="submit"
            className="w-full border border-gold/60 text-gold hover:bg-gold/10 transition-colors py-3 text-xs tracking-[0.25em] uppercase flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode === "login" ? "Enter Console" : "Create Account"}
          </button>
          {mode === "login" && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(null); }}
                className="text-gold hover:underline"
              >
                Sign up
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}