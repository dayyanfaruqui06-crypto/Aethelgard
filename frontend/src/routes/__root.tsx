import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="serif text-7xl gold-text">404</h1>
        <p className="mt-4 text-muted-foreground">This archive does not exist.</p>
        <Link to="/" className="mt-6 inline-block border border-gold/50 text-gold px-5 py-2 text-xs tracking-[0.2em] uppercase hover:bg-gold/10">
          Return to Intelligence
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="serif text-2xl">Signal Lost</h1>
        <p className="mt-2 text-sm text-muted-foreground">A disturbance interrupted the transmission.</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 border border-gold/50 text-gold px-5 py-2 text-xs tracking-[0.2em] uppercase hover:bg-gold/10"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Aethelgard — Intelligence Console" },
      { name: "description", content: "Elite research intelligence and synthesis console." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Inter:wght@300;400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const router = useRouter();

  const isPublic = pathname === "/login";

  // Invalidate caches on sign-in/out
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      qc.invalidateQueries();
      router.invalidate();
    });
    return () => subscription.unsubscribe();
  }, [qc, router]);

  useEffect(() => {
    if (!loading && !session && !isPublic) {
      navigate({ to: "/login", replace: true });
    }
  }, [loading, session, isPublic, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="serif italic text-2xl gold-text animate-pulse">Aethelgard</div>
      </div>
    );
  }

  if (isPublic) return <Outlet />;
  if (!session) return null;

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
