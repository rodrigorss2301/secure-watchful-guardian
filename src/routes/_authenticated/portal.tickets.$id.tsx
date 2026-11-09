import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/portal/tickets/$id")({
  head: () => ({ meta: [{ title: "Chamado — Autotechs Portal" }] }),
  component: PortalTicketView,
  errorComponent: ({ error }) => <p role="alert" className="p-6 text-sm text-destructive">{error.message}</p>,
  notFoundComponent: PortalTicketNotFound,
});

function PortalTicketNotFound() {
  const { t } = useI18n();
  return <p className="p-6 text-sm text-muted-foreground">{t("portal.notFound")}</p>;
}

function PortalTicketView() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const { profile, tenant } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const ticket = useQuery({
    queryKey: ["portal-ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const comments = useQuery({
    queryKey: ["portal-ticket-comments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_comments").select("*")
        .eq("ticket_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!tenant || !profile) throw new Error("no session");
      const { error } = await (supabase as any).from("ticket_comments").insert({
        tenant_id: tenant.id, ticket_id: id, author_id: profile.id, body: body.trim(), internal: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("portal.comment.sent"));
      setBody("");
      qc.invalidateQueries({ queryKey: ["portal-ticket-comments", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const tk = ticket.data;
  if (ticket.isLoading)
    return (
      <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("common.loading")}
      </div>
    );
  if (ticket.isError)
    return <p role="alert" className="p-6 text-sm text-destructive">{t("common.error")}</p>;
  if (!tk) return <p className="p-6 text-sm text-muted-foreground">{t("portal.empty")}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/portal/tickets"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> {t("portal.back")}</Link>
      </Button>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="font-mono text-xs text-muted-foreground">{tk.number}</span>
          <Badge variant="outline" className="text-[10px] uppercase">{t(`tickets.status.${tk.status}` as TKey)}</Badge>
          <Badge variant="outline" className="text-[10px] uppercase">{t(`tickets.priority.${tk.priority}` as TKey)}</Badge>
        </div>
        <h1 className="break-words text-2xl font-bold tracking-tight">{tk.title}</h1>
        {tk.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{tk.description}</p>}
      </header>

      <Card>
        <CardContent className="space-y-3 p-4">
          {(comments.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("portal.noReplies")}</p>}
          {(comments.data ?? []).map((c: any) => (
            <div key={c.id} className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{formatDateTime(c.created_at, lang)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <Textarea rows={3} aria-label={t("portal.comment.placeholder")} maxLength={5000} placeholder={t("portal.comment.placeholder")} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex justify-end">
            <Button onClick={() => send.mutate()} disabled={!body.trim() || send.isPending}>{send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{t("portal.comment.send")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}