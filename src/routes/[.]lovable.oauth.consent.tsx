import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Logo } from "@/components/brand/logo";
import { Loader2 } from "lucide-react";

type OAuthClient = { name?: string; client_name?: string; redirect_uri?: string } | null;
type AuthorizationDetails = {
  client?: OAuthClient;
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
} | null;

type SupabaseOAuth = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails; error: { message: string } | null }>;
};

function oauth(): SupabaseOAuth {
  return (supabase.auth as unknown as { oauth: SupabaseOAuth }).oauth;
}

function sameOriginPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = sameOriginPath(location.pathname + location.searchStr) ?? "/";
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md p-6">
        <h1 className="mb-2 text-lg font-semibold">Não foi possível carregar a autorização</h1>
        <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </Card>
    </div>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.client_name ?? details?.client?.name ?? "este aplicativo";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("Servidor de autorização não retornou redirecionamento."); return; }
    window.location.href = target;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo size={40} /></div>
        <Card className="p-6">
          <h1 className="mb-1 font-display text-xl font-bold">Conectar {clientName}</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {clientName} poderá usar as ferramentas MCP deste app como você, respeitando suas permissões e RLS.
          </p>
          {details?.client?.redirect_uri && (
            <p className="mb-4 break-all rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Redirecionamento: {details.client.redirect_uri}
            </p>
          )}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
              Negar
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aprovar
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}