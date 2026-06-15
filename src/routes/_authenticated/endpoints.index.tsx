import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Server as ServerIcon, ExternalLink, Download } from "lucide-react";
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
import { EndpointFormDialog } from "@/components/endpoints/endpoint-form-dialog";
import { InstallAgentDialog } from "@/components/endpoints/install-agent-dialog";
import { LATEST_AGENT_VERSION, isAgentOutdated } from "@/lib/agent-version";
import {
  ENDPOINT_STATUSES, ENDPOINT_TYPES, STATUS_DOT, STATUS_TONE, TYPE_ICON, timeAgo,
  type Endpoint, type EndpointStatus, type EndpointType,
} from "@/lib/endpoints";

type EndpointRow = Endpoint & { clients: { id: string; name: string } | null };

export const Route = createFileRoute("/_authenticated/endpoints/")({
  head: () => ({ meta: [{ title: "Endpoints — Autotechs RMM" }] }),
  component: EndpointsPage,
});

function EndpointsPage() {
  const { t } = useI18n();
  const { tenant, hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canWrite = hasAnyRole(["admin", "technician"]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EndpointStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<EndpointType | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [deleting, setDeleting] = useState<Endpoint | null>(null);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);

  const { data: endpoints, isLoading } = useQuery({
    queryKey: ["endpoints", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoints")
        .select("*, clients!inner(id, name)")
        .order("hostname");
      if (error) throw error;
      return data as EndpointRow[];
    },
    enabled: !!tenant,
    refetchInterval: 30_000,
  });

  const { data: clientOptions } = useQuery({
    queryKey: ["clients-lite", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("endpoints").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("endpoints.deleted"));
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!endpoints) return [];
    const q = search.trim().toLowerCase();
    return endpoints.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (clientFilter !== "all" && e.client_id !== clientFilter) return false;
      if (!q) return true;
      return (
        e.hostname.toLowerCase().includes(q) ||
        (e.ip_address ?? "").toLowerCase().includes(q) ||
        (e.os ?? "").toLowerCase().includes(q) ||
        (e.clients?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [endpoints, search, statusFilter, typeFilter, clientFilter]);

  const counts = useMemo(() => {
    const base: Record<EndpointStatus, number> = { online: 0, offline: 0, warning: 0, critical: 0 };
    endpoints?.forEach((e) => { base[e.status] += 1; });
    return base;
  }, [endpoints]);

  return (
    <div>
      <PageHeader
        title={t("endpoints.title")}
        description={t("endpoints.subtitle")}
        actions={canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAgentDialogOpen(true)}>
              <Download className="mr-2 h-4 w-4" /> Instalar agente
            </Button>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="shadow-glow">
              <Plus className="mr-2 h-4 w-4" />{t("endpoints.new")}
            </Button>
          </div>
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {ENDPOINT_STATUSES.map((s) => (
          <Card key={s} className="border-border/60 bg-card/60 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
              {t(`endpoints.status.${s}` as TKey)}
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{counts[s]}</p>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("endpoints.search")} />
          </div>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("endpoints.filter.allClients")}</SelectItem>
              {clientOptions?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EndpointStatus | "all")}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("endpoints.filter.all")}</SelectItem>
              {ENDPOINT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t(`endpoints.status.${s}` as TKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as EndpointType | "all")}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("endpoints.filter.all")}</SelectItem>
              {ENDPOINT_TYPES.map((tp) => (
                <SelectItem key={tp} value={tp}>{t(`endpoints.type.${tp}` as TKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-6">{[0,1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="rounded-full bg-primary/10 p-4"><ServerIcon className="h-7 w-7 text-primary" /></div>
            <p className="text-sm text-muted-foreground">{t("endpoints.empty")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("endpoints.col.host")}</TableHead>
                <TableHead>{t("endpoints.col.client")}</TableHead>
                <TableHead>{t("endpoints.col.os")}</TableHead>
                <TableHead>{t("endpoints.col.ip")}</TableHead>
                <TableHead>{t("endpoints.col.usage")}</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead>{t("endpoints.col.heartbeat")}</TableHead>
                <TableHead>{t("endpoints.col.status")}</TableHead>
                <TableHead className="text-right">—</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const Icon = TYPE_ICON[e.type];
                return (
                  <TableRow key={e.id} className="group">
                    <TableCell>
                      <Link to="/endpoints/$id" params={{ id: e.id }} className="flex items-center gap-2 font-medium hover:text-primary">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {e.hostname}
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.clients?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.os ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.ip_address ?? "—"}</TableCell>
                    <TableCell><MiniUsage cpu={e.cpu_usage} ram={e.ram_usage} disk={e.disk_usage} /></TableCell>
                    <TableCell><AgentVersionCell version={e.agent_version} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{timeAgo(e.last_heartbeat, t("endpoints.detail.never"))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1.5 uppercase text-[10px] ${STATUS_TONE[e.status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[e.status]}`} />
                        {t(`endpoints.status.${e.status}` as TKey)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canWrite && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(e); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(e)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
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

      <EndpointFormDialog open={dialogOpen} onOpenChange={setDialogOpen} endpoint={editing} />
      <InstallAgentDialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting?.hostname}</AlertDialogTitle>
            <AlertDialogDescription>{t("clients.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >{t("clients.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MiniUsage({ cpu, ram, disk }: { cpu: number | null; ram: number | null; disk: number | null }) {
  const items: { label: string; value: number | null }[] = [
    { label: "C", value: cpu }, { label: "R", value: ram }, { label: "D", value: disk },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1" title={`${it.label} ${it.value ?? "—"}%`}>
          <span className="text-[10px] font-mono text-muted-foreground">{it.label}</span>
          <div className="h-1.5 w-8 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${it.value == null ? "" : it.value >= 90 ? "bg-destructive" : it.value >= 75 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${it.value ?? 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}