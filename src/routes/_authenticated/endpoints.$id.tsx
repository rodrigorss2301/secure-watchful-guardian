import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Pencil, Trash2, Cpu, MemoryStick, HardDrive, Wifi, Globe, Hash, Activity,
  Server as ServerIcon, Network, Package, ListTree, Clock, User as UserIcon, Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { EndpointFormDialog } from "@/components/endpoints/endpoint-form-dialog";
import {
  STATUS_DOT, STATUS_TONE, TYPE_ICON, timeAgo, usageTone,
  type Endpoint,
} from "@/lib/endpoints";
import { useNavigate } from "@tanstack/react-router";

type EndpointRow = Endpoint & { clients: { id: string; name: string } | null };

type DiskInfo = { name?: string; mount?: string; fs?: string; type?: string; size_gb?: number; free_gb?: number; used_pct?: number };
type NicInfo = { name?: string; mac?: string; ip?: string; ipv6?: string; speed_mbps?: number; status?: string };
type SoftwareInfo = { name?: string; version?: string; publisher?: string; install_date?: string };
type ProcessInfo = { name?: string; pid?: number; cpu?: number; ram_mb?: number; user?: string };
type ServiceInfo = { name?: string; display_name?: string; status?: string; start_type?: string };
type UpdateInfo = { id?: string; title?: string; severity?: string; kb?: string };

function fmtBytes(mb?: number | null) {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}
function fmtUptime(s?: number | null) {
  if (!s) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export const Route = createFileRoute("/_authenticated/endpoints/$id")({
  head: () => ({ meta: [{ title: "Endpoint — Autotechs RMM" }] }),
  component: EndpointDetailPage,
});

function EndpointDetailPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const { hasAnyRole } = useAuth();
  const canWrite = hasAnyRole(["admin", "technician"]);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: endpoint, isLoading } = useQuery({
    queryKey: ["endpoint", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoints")
        .select("*, clients(id, name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as EndpointRow | null;
    },
    refetchInterval: 15_000,
  });

  const { data: samples } = useQuery({
    queryKey: ["endpoint-samples", id],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("endpoint_metric_samples")
        .select("sampled_at, cpu_usage, ram_usage, disk_usage")
        .eq("endpoint_id", id)
        .gte("sampled_at", since)
        .order("sampled_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  const { data: alertsList } = useQuery({
    queryKey: ["endpoint-alerts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id, message, severity, status, created_at")
        .eq("endpoint_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const { data: activity } = useQuery({
    queryKey: ["endpoint-activity", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, summary, actor_email, created_at, entity_table")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("endpoints").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("endpoints.deleted"));
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      navigate({ to: "/endpoints" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!endpoint) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">404</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/endpoints">{t("common.back")}</Link></Button>
      </div>
    );
  }

  const Icon = TYPE_ICON[endpoint.type];
  const e = endpoint as EndpointRow & InventoryExtras;

  const counts = {
    critical: alertsList?.filter((a) => a.severity === "critical" && a.status !== "resolved").length ?? 0,
    warning: alertsList?.filter((a) => a.severity === "warning" && a.status !== "resolved").length ?? 0,
    info: alertsList?.filter((a) => a.severity === "info" && a.status !== "resolved").length ?? 0,
  };
  const softCount = (e.installed_software ?? []).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-8 text-muted-foreground">
            <Link to="/endpoints"><ArrowLeft className="mr-1.5 h-4 w-4" />{t("endpoints.title")}</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <Icon className="h-7 w-7 text-primary" />
            <h1 className="font-display text-3xl font-bold tracking-tight">{endpoint.hostname}</h1>
            <Badge variant="outline" className={`gap-1.5 uppercase text-[10px] ${STATUS_TONE[endpoint.status]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[endpoint.status]}`} />
              {t(`endpoints.status.${endpoint.status}` as TKey)}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase">{t(`endpoints.type.${endpoint.type}` as TKey)}</Badge>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-sm text-muted-foreground">
            {endpoint.clients && (
              <Link to="/clients/$id" params={{ id: endpoint.clients.id }} className="hover:text-primary">
                {endpoint.clients.name}
              </Link>
            )}
            <span>·</span>
            <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> {timeAgo(endpoint.last_heartbeat, t("endpoints.detail.never"))}</span>
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />{t("endpoints.edit")}</Button>
            <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
        <CountPill tone="critical" label="Crítico" value={counts.critical} />
        <CountPill tone="warning" label="Aviso" value={counts.warning} />
        <CountPill tone="info" label="Informação" value={counts.info} />
        <div className="ml-auto flex gap-2">
          <CountPill tone="muted" label="Sistema Operacional" value={endpoint.os ? 1 : 0} />
          <CountPill tone="muted" label="Software" value={softCount} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-border/60 p-0">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="m-3 flex flex-wrap">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="hardware">Hardware</TabsTrigger>
              <TabsTrigger value="disks">Discos</TabsTrigger>
              <TabsTrigger value="os">SO e segurança</TabsTrigger>
              <TabsTrigger value="software">Software</TabsTrigger>
              <TabsTrigger value="processes">Processos</TabsTrigger>
              <TabsTrigger value="services">Serviços</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-5 p-5 pt-0">
              <div className="grid gap-5 md:grid-cols-3">
                <Metric icon={Cpu} label="CPU" value={endpoint.cpu_usage} />
                <Metric icon={MemoryStick} label="RAM" value={endpoint.ram_usage} />
                <Metric icon={HardDrive} label="Disco" value={endpoint.disk_usage} />
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <dl className="space-y-3">
                  <Row label="Hostname" value={endpoint.hostname} />
                  <Row label="Domínio" value={e.domain} />
                  <Row label={t("endpoints.field.os")} value={[endpoint.os, endpoint.os_version].filter(Boolean).join(" ") || null} />
                  <Row label="IP privado" value={endpoint.ip_address && <span className="font-mono">{endpoint.ip_address}</span>} />
                  <Row label="Último usuário logado" value={e.logged_user} />
                  <Row label="Visto pela última vez" value={endpoint.last_heartbeat ? new Date(endpoint.last_heartbeat).toLocaleString() : null} />
                </dl>
                <dl className="space-y-3">
                  <Row label="Último reinício" value={e.last_boot_at ? new Date(e.last_boot_at).toLocaleString() : null} />
                  <Row label={<><Clock className="mr-1 inline h-3 w-3" />Uptime</>} value={fmtUptime(e.uptime_seconds)} />
                  <Row label="Fuso horário" value={e.timezone} />
                  <Row label={t("endpoints.field.agent")} value={endpoint.agent_version} />
                  <Row label="IP público" value={e.public_ip && <span className="font-mono">{e.public_ip}</span>} />
                  <Row label="Data de adição" value={endpoint.created_at ? new Date(endpoint.created_at).toLocaleString() : null} />
                </dl>
              </div>
              {endpoint.notes && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas</h3>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{endpoint.notes}</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="hardware" className="p-5 pt-0"><HardwareTab e={e} /></TabsContent>
            <TabsContent value="disks" className="p-5 pt-0"><DisksTab e={e} /></TabsContent>
            <TabsContent value="os" className="p-5 pt-0"><OsTab e={e} /></TabsContent>
            <TabsContent value="software" className="p-5 pt-0"><SoftwareTab e={e} /></TabsContent>
            <TabsContent value="processes" className="p-5 pt-0"><ProcessesTab e={e} /></TabsContent>
            <TabsContent value="services" className="p-5 pt-0"><ServicesTab e={e} /></TabsContent>
          </Tabs>
        </Card>

        <div className="space-y-6">
          <MetricsChartCard samples={samples ?? []} />
          <ActivityCard items={activity ?? []} />
          <AlertsListCard items={alertsList ?? []} />
        </div>
      </div>

      <EndpointFormDialog open={editOpen} onOpenChange={setEditOpen} endpoint={endpoint} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{endpoint.hostname}</AlertDialogTitle>
            <AlertDialogDescription>{t("clients.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >{t("clients.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: number | null }) {
  const pct = value ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className="font-mono text-sm font-semibold">{value != null ? `${pct.toFixed(0)}%` : "—"}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full transition-all ${usageTone(value)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-right">{value ?? <span className="text-muted-foreground/50">—</span>}</dd>
    </div>
  );
}

function Section({ icon: Icon, title, count, children }: { icon: typeof Cpu; title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card className="border-border/60 p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4" /> {title}
        {count != null && <Badge variant="secondary" className="ml-1 text-[10px]">{count}</Badge>}
      </h2>
      {children}
    </Card>
  );
}

