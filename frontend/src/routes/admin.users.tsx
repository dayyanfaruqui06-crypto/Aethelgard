import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus, ShieldCheck, ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { listUsers, createUser, deleteUser, setUserRole } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "User Management — Aethelgard" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const del = useServerFn(deleteUser);
  const setRole = useServerFn(setUserRole);

  useEffect(() => {
    if (!loading && role !== "admin") navigate({ to: "/", replace: true });
  }, [loading, role, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
    enabled: role === "admin",
  });

  const createMut = useMutation({
    mutationFn: (input: { email: string; password: string; role: "admin" | "user" }) =>
      create({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => del({ data: { userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const roleMut = useMutation({
    mutationFn: (input: { userId: string; role: "admin" | "user" }) => setRole({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");

  if (role !== "admin") return null;

  return (
    <div className="max-w-5xl mx-auto w-full px-6 md:px-12 py-8 space-y-8">
      <div>
        <div className="label-mono">Console Administration</div>
        <h1 className="serif italic text-3xl md:text-4xl gold-text">User Management</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMut.mutate(
            { email, password, role: newRole },
            {
              onSuccess: () => {
                setEmail("");
                setPassword("");
              },
            },
          );
        }}
        className="border border-border bg-card/40 rounded-sm p-5 space-y-3"
      >
        <div className="flex items-center gap-2 text-sm">
          <UserPlus size={16} className="text-gold" /> Issue new credentials
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="email"
            required
            placeholder="email@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50"
          />
          <input
            type="text"
            required
            minLength={8}
            placeholder="initial password (min 8)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
            className="bg-background/50 border border-border px-3 py-2 text-sm outline-none focus:border-gold/50"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button
            type="submit"
            disabled={createMut.isPending}
            className="border border-gold/60 text-gold hover:bg-gold/10 py-2 text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {createMut.isPending && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
        {createMut.error && (
          <div className="text-destructive text-xs">{(createMut.error as Error).message}</div>
        )}
      </form>

      <div className="border border-border bg-card/20 rounded-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border label-mono">Active personnel</div>
        {isLoading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="animate-spin" size={16} />
          </div>
        ) : error ? (
          <div className="p-5 text-destructive text-sm">{(error as Error).message}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left label-mono border-b border-border">
              <tr>
                <th className="px-5 py-2">Email</th>
                <th className="px-5 py-2">Role</th>
                <th className="px-5 py-2">Created</th>
                <th className="px-5 py-2">Last sign-in</th>
                <th className="px-5 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => {
                const isAdmin = u.roles.includes("admin");
                return (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-background/30">
                    <td className="px-5 py-3">{u.email}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`label-mono px-2 py-0.5 rounded-sm border ${
                          isAdmin
                            ? "border-gold/50 text-gold bg-gold/10"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {isAdmin ? "admin" : "user"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3 text-right space-x-2">
                      <button
                        onClick={() =>
                          roleMut.mutate({ userId: u.id, role: isAdmin ? "user" : "admin" })
                        }
                        className="text-xs text-muted-foreground hover:text-gold inline-flex items-center gap-1"
                        title={isAdmin ? "Demote to user" : "Promote to admin"}
                      >
                        {isAdmin ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                        {isAdmin ? "Demote" : "Promote"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${u.email}? This cannot be undone.`))
                            deleteMut.mutate(u.id);
                        }}
                        className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
