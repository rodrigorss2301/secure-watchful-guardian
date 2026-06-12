import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Building2, ExternalLink, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { SLA_TONE, STATUS_TONE, CLIENT_STATUSES, type Client, type ClientStatus } from "@/lib/clients";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Clientes — Autotechs RMM" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const { t } = useI18n();
  const { tenant, hasAnyRole, hasRole } = useAuth();
  const qc = useQueryClient();
  const canWrite = hasAnyRole(["admin", "technician"]);
  const canDelete = hasRole("admin");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!tenant,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("clients.deleted"));
      qc.invalidateQueries({ queryKey: ["clients"] });
      setDeleting(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.industry ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [clients, search, statusFilter]);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setDialogOpen(true); };

  return (
    <div>
      <PageHeader
        title={t("clients.title")}
        description={t("clients.subtitle")}
        actions={canWrite && (
          <Button onClick={openCreate} className="shadow-glow">
            <Plus className="mr-2 h-4 w-4" />
            {t("clients.new")}
          </Button>
        )}
      />

      <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("clients.search")}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ClientStatus | "all")}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("clients.filter.all")}</SelectItem>
              {CLIENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t(`clients.status.${s}` as TKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-6">
            {[0,1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">{t("clients.empty")}</p>
            {canWrite && (
              <Button variant="outline" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> {t("clients.emptyCta")}
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clients.col.name")}</TableHead>
                <TableHead>{t("clients.col.industry")}</TableHead>
                <TableHead>{t("clients.col.contact")}</TableHead>
                <TableHead>{t("clients.col.sla")}</TableHead>
                <TableHead>{t("clients.col.status")}</TableHead>
                <TableHead className="text-right">—</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell>
                    <Link
                      to="/clients/$id"
                      params={{ id: c.id }}
                      className="flex items-center gap-2 font-medium hover:text-primary"
                    >
                      <span>{c.name}</span>
                      <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.industry ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      {c.email && <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</span>}
                      {c.phone && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</span>}
                      {!c.email && !c.phone && "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`uppercase text-[10px] ${SLA_TONE[c.sla_tier]}`}>
                      {t(`clients.sla.${c.sla_tier}` as TKey)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`uppercase text-[10px] ${STATUS_TONE[c.status]}`}>
                      {t(`clients.status.${c.status}` as TKey)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite && (
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(c)} aria-label="delete" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ClientFormDialog open={dialogOpen} onOpenChange={setDialogOpen} client={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting?.name}</AlertDialogTitle>
            <AlertDialogDescription>{t("clients.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("clients.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}