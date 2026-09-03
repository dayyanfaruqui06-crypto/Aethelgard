import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Shield, Brain, Network, Archive, Clock, Settings, Lock,
  Users, LogOut, ArrowRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { HealthBadge } from "@/components/HealthBadge";
import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";

const topNav = [
  { to: "/", label: "Intelligence" },
  { to: "/synthesis", label: "Synthesis" },
  { to: "/archives", label: "Archives" },
] as const;

const sideNav = [
  { to: "/", label: "Current Session", icon: Brain },
  { to: "/cognitive-maps", label: "Cognitive Maps", icon: Network },
  { to: "/research-vault", label: "Research Vault", icon: Archive },
  { to: "/historical-context", label: "Historical Context", icon: Clock },
] as const;

const utilNav = [
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/security", label: "Security", icon: Lock },
] as const;

export function AppLayout({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (p: string) => pathname === p;
  const { user, role, signOut } = useAuth();

  const { serifDisplay } = useSettings();

  useEffect(() => {
    document.documentElement.classList.toggle("no-serif", !serifDisplay);
  }, [serifDisplay]);

  const [endpoint, setEndpoint] = useState(
    () => localStorage.getItem("aethelgard.endpoint") || "http://localhost:8000/v1/chat/completions"
  );
  const [token, setToken] = useState(
    () => localStorage.getItem("aethelgard.token") || ""
  );

  useEffect(() => {
    const sync = () => {
      setEndpoint(localStorage.getItem("aethelgard.endpoint") || "http://localhost:8000/v1/chat/completions");
      setToken(localStorage.getItem("aethelgard.token") || "");
    };
    window.addEventListener("aethelgard:settings-updated", sync);
    return () => window.removeEventListener("aethelgard:settings-updated", sync);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-16 border-b border-border bg-sidebar/80 backdrop-blur-md flex items-center px-6 z-20">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Aethelgard" className="h-12 w-12 object-contain rounded-sm" />
          <span className="serif text-2xl gold-text tracking-wide">Æthelgard</span>
        </Link>
        <nav className="flex-1 flex justify-center gap-10">
          {topNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`text-sm tracking-wide transition-colors relative pb-1 ${
                isActive(item.to) ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
              {isActive(item.to) && (
                <span className="absolute -bottom-0.5 left-0 right-0 h-px bg-gold" />
              )}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-muted-foreground">
          <HealthBadge endpoint="http://localhost:8000/v1/models" />
          <div className="text-right hidden sm:block ml-2">
            <div className="text-xs text-foreground/80 truncate max-w-[180px]">{user?.email}</div>
            <div className="label-mono text-[0.6rem] text-gold/80">{role ?? "—"}</div>
          </div>
          <button
            onClick={() => signOut()}
            title="Sign out"
            className="hover:text-foreground transition-colors p-2"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex">
        <aside className="w-64 border-r border-sidebar-border bg-sidebar/60 flex flex-col">
          <div className="p-5 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-sm border border-gold/40 bg-gold/5 flex items-center justify-center">
                <Shield size={16} className="text-gold" />
              </div>
              <div>
                <div className="text-sm font-medium">
                  {role === "admin" ? "Principal Researcher" : "Researcher"}
                </div>
                <div className="label-mono text-[0.6rem] text-gold/80">
                  {role === "admin" ? "Elite Access Level" : "Standard Access"}
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {sideNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-all ${
                    active
                      ? "bg-background/60 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/30"
                  }`}
                >
                  {active && <span className="absolute right-0 top-2 bottom-2 w-0.5 bg-gold rounded-full" />}
                  <Icon size={16} className={active ? "text-gold" : ""} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {role === "admin" && (
              <Link
                to="/admin/users"
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-all mt-3 border-t border-border/40 pt-4 ${
                  isActive("/admin/users")
                    ? "bg-background/60 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/30"
                }`}
              >
                {isActive("/admin/users") && (
                  <span className="absolute right-0 top-2 bottom-2 w-0.5 bg-gold rounded-full" />
                )}
                <Users size={16} className={isActive("/admin/users") ? "text-gold" : ""} />
                <span>User Management</span>
              </Link>
            )}
          </nav>

          <div className="p-3 space-y-2">
            <Link
              to="/synthesis"
              className="w-full block text-center border border-gold/50 text-gold hover:bg-gold/10 transition-colors py-3 text-xs tracking-[0.2em] uppercase"
            >
              Initiate Synthesis
            </Link>
            {utilNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 flex flex-col relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{ backgroundImage: "radial-gradient(circle at 30% 20%, var(--gold) 0%, transparent 50%)" }}
          />
          <div className="flex-1 relative">{children ?? <Outlet />}</div>
          <footer className="border-t border-border px-8 py-3 flex justify-between label-mono">
            <span>Encryption Active: AES-256 Level</span>
            <span>System: Aethelgard v4.2</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export function PromptBar({ title }: { title: string }) {
  return (
    <div className="border border-border bg-card/40 backdrop-blur-sm rounded-sm">
      <div className="px-5 pt-4">
        <div className="serif text-xl text-muted-foreground/70">{title}</div>
      </div>
      <div className="flex items-center gap-3 px-5 py-4">
        <input
          placeholder="Describe a thought, emotion, or interaction…"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
        />
        <button className="text-gold hover:translate-x-0.5 transition-transform">
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}