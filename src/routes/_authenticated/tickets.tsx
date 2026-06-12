import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, TicketCheck, ExternalLink, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { TicketFormDialog } from "@/components/tickets/ticket-form-dialog";
import {
  CATEGORY_ICON, PRIORITY_TONE, STATUS_TONE, TICKET_PRIORITIES, TICKET_STATUSES,
  relTime, slaState, type Ticket, type TicketPriority, type TicketStatus,
} from "@/lib/tickets";

type TicketRow = Ticket & {
  clients: { id: string; name: string } | null;
};

type StaffEntry = { id: string; full_name: string | null; email: string };

export const Route = createFileRoute("/_authenticated/tickets")({
  head: () => ({ meta: [{ title: "Tickets — Autotechs RMM" }] }),
  component: TicketsPage,
});

function TicketsPage() {
  const { t } = useI18n();
  const { tenant, user, hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canWrite = hasAnyRole(["admin", "technician"]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all" | "open_only">("open_only");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "me" | "unassigned">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [deleting, setDeleting] = useState<Ticket | null>(null);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["tickets", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, clients!inner(id, name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as unknown as TicketRow[];
    },
    enabled: !!tenant,
    refetchInterval: 30_000,
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("tickets.deleted"));
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!tickets) return [];
    const q = search.trim().toLowerCase();
    return tickets.filter((tk) => {
      if (statusFilter === "open_only" && (tk.status === "resolved" || tk.status === "closed")) return false;
      if (statusFilter !== "all" && statusFilter !== "open_only" && tk.status !== statusFilter) return false;
      if (priorityFilter !== "all" && tk.priority !== priorityFilter) return false;
      if (assigneeFilter === "me" && tk.assignee_id !== user?.id) return false;
      if (assigneeFilter === "unassigned" && tk.assignee_id) return false;
      if (!q) return true;
      return (
        tk.number.toLowerCase().includes(q) ||
        tk.title.toLowerCase().includes(q) ||
        (tk.clients?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [tickets, search, statusFilter, priorityFilter, assigneeFilter, user?.id]);

  const counts = useMemo(() => {
    const base: Record<TicketStatus, number> = { open: 0, in_progress: 0, waiting: 0, resolved: 0, closed: 0 };
    tickets?.forEach((tk) => { base[tk.status] += 1; });
    return base;
  }, [tickets]);

  return (
    <div>
      <PageHeader
        title={t("tickets.title")}
        description={t("tickets.subtitle")}
        actions={canWrite && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="shadow-glow">
            <Plus className="mr-2 h-4 w-4" />{t("tickets.new")}
          </Button>
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {TICKET_STATUSES.map((s) => (
          <Card key={s} className="border-border/60 bg-card/60 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t(`tickets.status.${s}` as TKey)}</div>
            <p className="mt-2 font-display text-2xl font-bold">{counts[s]}</p>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("tickets.search")} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TicketStatus | "all" | "open_only")}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open_only">{t("tickets.status.open")} + {t("tickets.status.in_progress")}</SelectItem>
              <SelectItem value="all">{t("tickets.filter.all")}</SelectItem>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t(`tickets.status.${s}` as TKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as TicketPriority | "all")}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tickets.filter.all")}</SelectItem>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{t(`tickets.priority.${p}` as TKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={(v) => setAssigneeFilter(v as typeof assigneeFilter)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tickets.filter.all")}</SelectItem>
              <SelectItem value="me">{t("tickets.filter.assigneeMe")}</SelectItem>
              <SelectItem value="unassigned">{t("tickets.unassigned")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-6">{[0,1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="rounded-full bg-primary/10 p-4"><TicketCheck className="h-7 w-7 text-primary" /></div>
            <p className="text-sm text-muted-foreground">{t("tickets.empty")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tickets.col.number")}</TableHead>
                <TableHead>{t("tickets.col.title")}</TableHead>
                <TableHead>{t("tickets.col.client")}</TableHead>
                <TableHead>{t("tickets.col.assignee")}</TableHead>
                <TableHead>{t("tickets.col.priority")}</TableHead>
                <TableHead>{t("tickets.col.status")}</TableHead>
                <TableHead>{t("tickets.col.sla")}</TableHead>
                <TableHead>{t("tickets.col.updated")}</TableHead>
                <TableHead className="text-right">—</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tk) => {
                const Cat = CATEGORY_ICON[tk.category];
                const sla = slaState(tk);
                return (
                  <TableRow key={tk.id} className="group">
                    <TableCell className="font-mono text-xs text-muted-foreground">{tk.number}</TableCell>
                    <TableCell>
                      <Link to="/tickets/$id" params={{ id: tk.id }} className="flex items-center gap-2 font-medium hover:text-primary">
                        <Cat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="line-clamp-1">{tk.title}</span>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{tk.clients?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(() => {
                        const a = tk.assignee_id ? staff?.get(tk.assignee_id) : null;
                        return a ? (a.full_name ?? a.email) : <span className="italic opacity-60">{t("tickets.unassigned")}</span>;
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] uppercase ${PRIORITY_TONE[tk.priority]}`}>
                        {t(`tickets.priority.${tk.priority}` as TKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_TONE[tk.status]}`}>
                        {t(`tickets.status.${tk.status}` as TKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sla === "breached" ? (
                        <Badge variant="outline" className="gap-1 border-destructive/40 bg-destructive/15 text-destructive text-[10px]"><AlertTriangle className="h-3 w-3" />{t("tickets.sla.breached")}</Badge>
                      ) : sla === "imminent" ? (
                        <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-500 text-[10px]"><Clock className="h-3 w-3" />{t("tickets.sla.imminent")}</Badge>
                      ) : sla === "ok" ? (
                        <span className="text-xs text-muted-foreground">{new Date(tk.sla_due_at!).toLocaleString()}</span>
                      ) : <span className="text-xs text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{relTime(tk.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      {canWrite && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(tk); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(tk)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <TicketFormDialog open={dialogOpen} onOpenChange={setDialogOpen} ticket={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting?.number} — {deleting?.title}</AlertDialogTitle>
            <AlertDialogDescription>{t("tickets.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >{t("tickets.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}