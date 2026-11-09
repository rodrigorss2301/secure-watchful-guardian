import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Pencil, Trash2, Send, AlertTriangle, Clock, Loader2, Lock,
  Activity, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { TicketFormDialog } from "@/components/tickets/ticket-form-dialog";
import {
  CATEGORY_ICON, PRIORITY_TONE, STATUS_TONE, TICKET_PRIORITIES, TICKET_STATUSES,
  relTime, slaState,
  type Ticket, type TicketComment, type TicketActivity, type TicketPriority, type TicketStatus,
} from "@/lib/tickets";

type TicketRow = Ticket & {
  clients: { id: string; name: string } | null;
  endpoints: { id: string; hostname: string } | null;
  client_contacts: { id: string; name: string } | null;
};

type StaffEntry = { id: string; full_name: string | null; email: string };
type CommentRow = TicketComment;

export const Route = createFileRoute("/_authenticated/tickets/$id")({
  head: () => ({ meta: [{ title: "Chamado — Autotechs RMM" }] }),
  component: TicketDetailPage,
});

function TicketDetailPage() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const { tenant, user, hasAnyRole } = useAuth();
  const canWrite = hasAnyRole(["admin", "technician"]);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`*, clients(id, name), endpoints(id, hostname), client_contacts(id, name)`)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as TicketRow | null;
    },
  });

  const { data: staff } = useQuery({
    queryKey: ["staff-map", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      const map = new Map<string, StaffEntry>();
      (data ?? []).forEach((p) => map.set(p.id, p as StaffEntry));
      return map;
    },
    enabled: !!tenant,
  });

  const { data: comments } = useQuery({
    queryKey: ["ticket-comments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_comments")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as CommentRow[];
    },
    refetchInterval: 15_000,
  });

  const { data: activity } = useQuery({
    queryKey: ["ticket-activity", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_activity")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TicketActivity[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("tickets.deleted"));
      qc.invalidateQueries({ queryKey: ["tickets"] });
      navigate({ to: "/tickets" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!tenant || !user) throw new Error("Auth missing");
      const { error } = await supabase.from("ticket_comments").insert({
        tenant_id: tenant.id, ticket_id: id, author_id: user.id,
        body: comment.trim(), internal,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment(""); setInternal(false);
      qc.invalidateQueries({ queryKey: ["ticket-comments", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quickUpdate = useMutation({
    mutationFn: async (patch: Partial<Ticket>) => {
      const { error } = await supabase.from("tickets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-activity", id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div role="status" aria-busy="true" aria-label={t("common.loading")}><Skeleton className="h-64" /></div>;
  if (!ticket) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">{t("common.notFound")}</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/tickets">{t("common.back")}</Link></Button>
      </div>
    );
  }

  const actVal = (prefix: string, v: string | null) => {
    if (!v) return "—";
    const k = `${prefix}.${v}` as TKey;
    const label = t(k);
    return label === k ? v : label;
  };
  const Cat = CATEGORY_ICON[ticket.category];
  const sla = slaState(ticket);
  const assignee = ticket.assignee_id ? staff?.get(ticket.assignee_id) : null;
  const creator = ticket.created_by ? staff?.get(ticket.created_by) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-9 text-muted-foreground">
            <Link to="/tickets"><ArrowLeft className="mr-1.5 h-4 w-4" />{t("tickets.title")}</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">{ticket.number}</span>
            <Cat aria-hidden="true" className="h-6 w-6 text-primary" />
            <h1 className="break-words font-display text-2xl font-bold tracking-tight md:text-3xl">{ticket.title}</h1>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_TONE[ticket.status]}`}>
              {t(`tickets.status.${ticket.status}` as TKey)}
            </Badge>
            <Badge variant="outline" className={`text-[10px] uppercase ${PRIORITY_TONE[ticket.priority]}`}>
              {t(`tickets.priority.${ticket.priority}` as TKey)}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase">{t(`tickets.category.${ticket.category}` as TKey)}</Badge>
            {sla === "breached" && <Badge variant="outline" className="gap-1 border-destructive/40 bg-destructive/15 text-destructive text-[10px]"><AlertTriangle className="h-3 w-3" />{t("tickets.sla.breached")}</Badge>}
            {sla === "imminent" && <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px]"><Clock className="h-3 w-3" />{t("tickets.sla.imminent")}</Badge>}
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />{t("tickets.edit")}</Button>
            <Button variant="ghost" aria-label={t("tickets.delete")} onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {ticket.description && (
            <Card className="border-border/60 p-5">
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{ticket.description}</p>
            </Card>
          )}

          <Card className="border-border/60 p-5">
            <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <MessageSquare className="h-4 w-4" />{t("tickets.detail.comments")}
            </h2>
            <div className="space-y-3">
              {comments?.length === 0 && (
                <p className="text-sm text-muted-foreground/70">{t("tickets.comment.empty")}</p>
              )}
              {comments?.map((c) => (
                <div key={c.id} className={`rounded-lg border p-3 text-sm ${c.internal ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-card/40"}`}>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-medium">{(() => {
                      const a = c.author_id ? staff?.get(c.author_id) : null;
                      return a?.full_name ?? a?.email ?? "—";
                    })()}</span>
                    <span className="flex items-center gap-2">
                      {c.internal && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><Lock className="h-3 w-3" />{t("tickets.comment.internal")}</span>}
                      {formatDateTime(c.created_at, lang)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>

            {canWrite && (
              <form
                className="mt-4 space-y-2"
                onSubmit={(e) => { e.preventDefault(); if (comment.trim()) addComment.mutate(); }}
              >
                <Textarea
                  aria-label={t("tickets.detail.comments")}
                  rows={3} maxLength={4000} value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("tickets.comment.placeholder")}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch id="internal" checked={internal} onCheckedChange={setInternal} />
                    <Label htmlFor="internal" className="cursor-pointer text-xs text-muted-foreground">{t("tickets.comment.internal")}</Label>
                  </div>
                  <Button type="submit" size="sm" disabled={!comment.trim() || addComment.isPending} className="shadow-glow">
                    {addComment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {t("tickets.comment.send")}
                  </Button>
                </div>
              </form>
            )}
          </Card>

          <Card className="border-border/60 p-5">
            <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Activity className="h-4 w-4" />{t("tickets.detail.activity")}
            </h2>
            {activity?.length === 0 && <p className="text-sm text-muted-foreground/70">{t("tickets.activity.empty")}</p>}
            <ul className="space-y-2 text-sm">
              {activity?.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-2 border-l-2 border-border pl-3 text-muted-foreground">
                  <span className="text-xs">{formatDateTime(a.created_at, lang)}</span>
                  <span>·</span>
                  <span>
                    {a.action === "status_change" && `${t("tickets.activity.status")}: ${actVal("tickets.status", a.old_value)} → ${actVal("tickets.status", a.new_value)}`}
                    {a.action === "priority_change" && `${t("tickets.activity.priority")}: ${actVal("tickets.priority", a.old_value)} → ${actVal("tickets.priority", a.new_value)}`}
                    {a.action === "assignee_change" && `${t("tickets.activity.assignee")}`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-border/60 p-5">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("tickets.detail.details")}
            </h2>
            <dl className="space-y-3 text-sm">
              <Row label={t("tickets.field.client")} value={
                ticket.clients && <Link to="/clients/$id" params={{ id: ticket.clients.id }} className="hover:text-primary">{ticket.clients.name}</Link>
              } />
              <Row label={t("tickets.field.endpoint")} value={
                ticket.endpoints && <Link to="/endpoints/$id" params={{ id: ticket.endpoints.id }} className="hover:text-primary">{ticket.endpoints.hostname}</Link>
              } />
              <Row label={t("tickets.field.contact")} value={ticket.client_contacts?.name} />
              <Row label={t("tickets.field.sla")} value={ticket.sla_due_at ? formatDateTime(ticket.sla_due_at, lang) : null} />
            </dl>

            {canWrite && (
              <div className="mt-5 space-y-3 border-t border-border/60 pt-4">
                <div>
                  <Label htmlFor="quick-status" className="text-xs uppercase tracking-wider text-muted-foreground">{t("tickets.field.status")}</Label>
                  <Select value={ticket.status} disabled={quickUpdate.isPending} onValueChange={(v) => quickUpdate.mutate({ status: v as TicketStatus })}>
                    <SelectTrigger id="quick-status" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TICKET_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{t(`tickets.status.${s}` as TKey)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="quick-priority" className="text-xs uppercase tracking-wider text-muted-foreground">{t("tickets.field.priority")}</Label>
                  <Select value={ticket.priority} disabled={quickUpdate.isPending} onValueChange={(v) => quickUpdate.mutate({ priority: v as TicketPriority })}>
                    <SelectTrigger id="quick-priority" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TICKET_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>{t(`tickets.priority.${p}` as TKey)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </Card>

          <Card className="border-border/60 p-5">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("tickets.detail.timeline")}
            </h2>
            <dl className="space-y-3 text-xs">
              <Row label={t("tickets.detail.created")} value={`${formatDateTime(ticket.created_at, lang)} · ${creator?.full_name ?? creator?.email ?? "—"}`} />
              <Row label={t("tickets.field.assignee")} value={assignee?.full_name ?? assignee?.email ?? t("tickets.unassigned")} />
              <Row label={t("tickets.col.updated")} value={relTime(ticket.updated_at)} />
              {ticket.resolved_at && <Row label={t("tickets.detail.resolved")} value={formatDateTime(ticket.resolved_at, lang)} />}
              {ticket.closed_at && <Row label={t("tickets.detail.closed")} value={formatDateTime(ticket.closed_at, lang)} />}
            </dl>
          </Card>
        </div>
      </div>

      <TicketFormDialog open={editOpen} onOpenChange={setEditOpen} ticket={ticket} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ticket.number} — {ticket.title}</AlertDialogTitle>
            <AlertDialogDescription>{t("tickets.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >{t("tickets.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm">{value ?? <span className="text-muted-foreground/50">—</span>}</dd>
    </div>
  );
}