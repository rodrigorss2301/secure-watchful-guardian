import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Pencil, Trash2, Cpu, MemoryStick, HardDrive, Wifi, Globe, Hash, Activity,
  Server as ServerIcon, Network, Package, ListTree, Clock, User as UserIcon, Shield, MonitorPlay, Power, RefreshCw,
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
import { formatDateTime, localeOf } from "@/lib/format";
import { EndpointFormDialog } from "@/components/endpoints/endpoint-form-dialog";
import { RemoteAccessDialog } from "@/components/endpoints/remote-access-dialog";
import { PowerDialog } from "@/components/endpoints/power-dialog";
import { InstallAgentDialog } from "@/components/endpoints/install-agent-dialog";
import { HistoryTab } from "@/components/endpoints/history-tab";
import { MaintenanceTab } from "@/components/endpoints/maintenance-tab";
import { AgentHealthCard } from "@/components/endpoints/agent-health-card";
import { EventsTab } from "@/components/endpoints/events-tab";
import { CommandsTimeline } from "@/components/endpoints/commands-timeline";
import { LATEST_AGENT_VERSION, isAgentOutdated } from "@/lib/agent-version";
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
  const { t, lang } = useI18n();
  const { hasAnyRole } = useAuth();
  const canWrite = hasAnyRole(["admin", "technician"]);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rdpOpen, setRdpOpen] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const [updateAgentOpen, setUpdateAgentOpen] = useState(false);

  const { data: endpoint, isLoading, isError, refetch } = useQuery({
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

  if (isLoading) return <Skeleton className="h-64" role="status" aria-label={t("common.loading")} />;
  if (isError) {
    return (
      <div role="alert" className="py-20 text-center">
        <p className="text-muted-foreground">{t("common.error")}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>{t("common.retry")}</Button>
          <Button asChild variant="ghost"><Link to="/endpoints">{t("common.back")}</Link></Button>
        </div>
      </div>
    );
  }
  if (!endpoint) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">{t("endpoints.d.notFound")}</p>
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-8 text-muted-foreground">
            <Link to="/endpoints"><ArrowLeft aria-hidden className="mr-1.5 h-4 w-4" />{t("endpoints.title")}</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <Icon aria-hidden className="h-7 w-7 shrink-0 text-primary" />
            <h1 className="break-words font-display text-2xl font-bold tracking-tight sm:text-3xl">{endpoint.display_name || endpoint.hostname}</h1>
            <Badge variant="outline" className={`gap-1.5 uppercase text-[10px] ${STATUS_TONE[endpoint.status]}`}>
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[endpoint.status]}`} />
              {t(`endpoints.status.${endpoint.status}` as TKey)}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase">{t(`endpoints.type.${endpoint.type}` as TKey)}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {endpoint.clients && (
              <Link to="/clients/$id" params={{ id: endpoint.clients.id }} className="hover:text-primary">
                {endpoint.clients.name}
              </Link>
            )}
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1"><Activity aria-hidden className="h-3 w-3" /> {timeAgo(endpoint.last_heartbeat, t("endpoints.detail.never"))}</span>
          </div>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setRdpOpen(true)} className="shadow-glow">
              <MonitorPlay aria-hidden className="mr-2 h-4 w-4" />{t("endpoints.d.remote")}
            </Button>
            <Button variant="outline" onClick={() => setPowerOpen(true)}>
              <Power aria-hidden className="mr-2 h-4 w-4" />{t("endpoints.d.power")}
            </Button>
            <Button variant="outline" onClick={() => setUpdateAgentOpen(true)}>
              <RefreshCw aria-hidden className="mr-2 h-4 w-4" />{t("endpoints.d.updateAgent")}
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil aria-hidden className="mr-2 h-4 w-4" />{t("endpoints.edit")}</Button>
            <Button variant="ghost" size="icon" aria-label={t("endpoints.deleteEndpoint")} title={t("endpoints.deleteEndpoint")} onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
              <Trash2 aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
        <CountPill tone="critical" label={t("alerts.severity.critical")} value={counts.critical} />
        <CountPill tone="warning" label={t("alerts.severity.warning")} value={counts.warning} />
        <CountPill tone="info" label={t("endpoints.d.information")} value={counts.info} />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <CountPill tone="muted" label={t("endpoints.d.osShort")} value={endpoint.os ? 1 : 0} />
          <CountPill tone="muted" label={t("endpoints.d.tab.software")} value={softCount} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-border/60 p-0">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="m-3 flex h-auto flex-wrap justify-start">
              <TabsTrigger value="overview">{t("endpoints.d.tab.overview")}</TabsTrigger>
              <TabsTrigger value="hardware">{t("endpoints.d.tab.hardware")}</TabsTrigger>
              <TabsTrigger value="disks">{t("endpoints.d.tab.disks")}</TabsTrigger>
              <TabsTrigger value="os">{t("endpoints.d.tab.os")}</TabsTrigger>
              <TabsTrigger value="software">{t("endpoints.d.tab.software")}</TabsTrigger>
              <TabsTrigger value="processes">{t("endpoints.d.tab.processes")}</TabsTrigger>
              <TabsTrigger value="services">{t("endpoints.d.tab.services")}</TabsTrigger>
              <TabsTrigger value="events">{t("endpoints.d.tab.events")}</TabsTrigger>
              <TabsTrigger value="commands">{t("endpoints.d.tab.commands")}</TabsTrigger>
              <TabsTrigger value="history">{t("endpoints.d.tab.history")}</TabsTrigger>
              <TabsTrigger value="maintenance">{t("endpoints.d.tab.maintenance")}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-5 p-5 pt-0">
              <div className="grid gap-5 md:grid-cols-3">
                <Metric icon={Cpu} label="CPU" value={endpoint.cpu_usage} />
                <Metric icon={MemoryStick} label="RAM" value={endpoint.ram_usage} />
                <Metric icon={HardDrive} label={t("endpoints.d.disk")} value={endpoint.disk_usage} />
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <dl className="space-y-3">
                  <Row label={t("endpoints.field.hostname")} value={endpoint.hostname} />
                  <Row label={t("endpoints.d.domain")} value={e.domain} />
                  <Row label={t("endpoints.field.os")} value={[endpoint.os, endpoint.os_version].filter(Boolean).join(" ") || null} />
                  <Row label={t("endpoints.d.privateIp")} value={endpoint.ip_address && <span className="font-mono">{endpoint.ip_address}</span>} />
                  <Row label={t("endpoints.d.lastUser")} value={e.logged_user} />
                  <Row label={t("endpoints.d.lastSeen")} value={endpoint.last_heartbeat ? formatDateTime(endpoint.last_heartbeat, lang) : null} />
                </dl>
                <dl className="space-y-3">
                  <Row label={t("endpoints.d.lastReboot")} value={e.last_boot_at ? formatDateTime(e.last_boot_at, lang) : null} />
                  <Row label={<><Clock aria-hidden className="mr-1 inline h-3 w-3" />{t("history.uptime")}</>} value={fmtUptime(e.uptime_seconds)} />
                  <Row label={t("endpoints.d.timezone")} value={e.timezone} />
                  <Row label={t("endpoints.field.agent")} value={<AgentVersionInline version={endpoint.agent_version} />} />
                  <Row label={t("endpoints.d.publicIp")} value={e.public_ip && <span className="font-mono">{e.public_ip}</span>} />
                  <Row label={t("endpoints.d.addedOn")} value={endpoint.created_at ? formatDateTime(endpoint.created_at, lang) : null} />
                </dl>
              </div>
              {endpoint.notes && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("endpoints.d.notes")}</h3>
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
            <TabsContent value="events" className="p-5 pt-0"><EventsTab endpointId={endpoint.id} /></TabsContent>
            <TabsContent value="commands" className="p-5 pt-0"><CommandsTimeline endpointId={endpoint.id} /></TabsContent>
            <TabsContent value="history" className="p-5 pt-0"><HistoryTab endpointId={endpoint.id} /></TabsContent>
            <TabsContent value="maintenance" className="p-5 pt-0"><MaintenanceTab endpointId={endpoint.id} tenantId={endpoint.tenant_id} /></TabsContent>
          </Tabs>
        </Card>

        <div className="space-y-6">
          <AgentHealthCard endpoint={endpoint as any} canWrite={canWrite} />
          <MetricsChartCard samples={samples ?? []} />
          <ActivityCard items={activity ?? []} />
          <AlertsListCard items={alertsList ?? []} />
        </div>
      </div>

      <EndpointFormDialog open={editOpen} onOpenChange={setEditOpen} endpoint={endpoint} />
      <RemoteAccessDialog open={rdpOpen} onOpenChange={setRdpOpen} endpoint={endpoint} />
      <PowerDialog open={powerOpen} onOpenChange={setPowerOpen} endpoint={endpoint} />
      <InstallAgentDialog
        open={updateAgentOpen}
        onOpenChange={setUpdateAgentOpen}
        preselectedClientId={endpoint.clients?.id ?? endpoint.client_id ?? null}
        mode="update"
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("endpoints.deleteTitle").replace("{host}", endpoint.hostname)}</AlertDialogTitle>
            <AlertDialogDescription>{t("endpoints.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >{t("endpoints.delete")}</AlertDialogAction>
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
          <Icon aria-hidden className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className="font-mono text-sm font-semibold">{value != null ? `${pct.toFixed(0)}%` : "—"}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value != null ? Math.round(pct) : undefined} className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full transition-all ${usageTone(value)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right">{value ?? <span className="text-muted-foreground/50">—</span>}</dd>
    </div>
  );
}

function Section({ icon: Icon, title, count, children }: { icon: typeof Cpu; title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card className="border-border/60 p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon aria-hidden className="h-4 w-4" /> {title}
        {count != null && <Badge variant="secondary" className="ml-1 text-[10px]">{count}</Badge>}
      </h2>
      {children}
    </Card>
  );
}

type InventoryExtras = {
  cpu_model: string | null; cpu_cores: number | null; cpu_threads: number | null;
  ram_total_mb: number | null; gpu: string | null;
  manufacturer: string | null; model: string | null; serial_number: string | null; motherboard: string | null;
  bios_vendor: string | null; bios_version: string | null; bios_date: string | null;
  uptime_seconds: number | null; last_boot_at: string | null; timezone: string | null;
  domain: string | null; logged_user: string | null;
  public_ip: string | null; gateway: string | null; dns_servers: string[] | null;
  disks: DiskInfo[] | null; network_interfaces: NicInfo[] | null;
  installed_software: SoftwareInfo[] | null; running_processes: ProcessInfo[] | null;
  services: ServiceInfo[] | null; pending_updates: UpdateInfo[] | null;
  inventory_updated_at: string | null;
};
type EP = EndpointRow & InventoryExtras;

function CountPill({ tone, label, value }: { tone: "critical" | "warning" | "info" | "muted"; label: string; value: number }) {
  const cls = {
    critical: "bg-destructive/15 text-destructive border-destructive/30",
    warning: "bg-amber-500/15 text-amber-700 dark:text-amber-500 border-amber-500/30",
    info: "bg-sky-500/15 text-sky-700 dark:text-sky-500 border-sky-500/30",
    muted: "bg-muted/60 text-muted-foreground border-border",
  }[tone];
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${cls}`}>
      <span className="uppercase tracking-wider">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

function HardwareTab({ e }: { e: EP }) {
  const { t, lang } = useI18n();
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <dl className="space-y-3">
        <Row label="CPU" value={e.cpu_model} />
        <Row label={t("endpoints.d.coresThreads")} value={e.cpu_cores || e.cpu_threads ? `${e.cpu_cores ?? "—"} / ${e.cpu_threads ?? "—"}` : null} />
        <Row label={t("endpoints.d.ramTotal")} value={fmtBytes(e.ram_total_mb)} />
        <Row label="GPU" value={e.gpu} />
        <Row label={t("endpoints.d.manufacturer")} value={e.manufacturer} />
        <Row label={t("endpoints.d.model")} value={e.model} />
        <Row label={t("endpoints.d.serial")} value={e.serial_number && <span className="font-mono text-xs">{e.serial_number}</span>} />
        <Row label={t("endpoints.d.motherboard")} value={e.motherboard} />
      </dl>
      <dl className="space-y-3">
        <Row label="BIOS" value={[e.bios_vendor, e.bios_version].filter(Boolean).join(" ") || null} />
        <Row label={t("endpoints.d.biosDate")} value={e.bios_date} />
        <Row label={<><Clock aria-hidden className="mr-1 inline h-3 w-3" />{t("history.uptime")}</>} value={fmtUptime(e.uptime_seconds)} />
        <Row label={t("endpoints.d.lastBoot")} value={e.last_boot_at ? formatDateTime(e.last_boot_at, lang) : null} />
        <Row label={t("endpoints.d.inventoryUpdated")} value={e.inventory_updated_at ? formatDateTime(e.inventory_updated_at, lang) : null} />
      </dl>
    </div>
  );
}

function DisksTab({ e }: { e: EP }) {
  const { t } = useI18n();
  const disks = e.disks ?? [];
  if (!disks.length) return <Empty label={t("endpoints.d.noDisks")} />;
  return (
    <div className="space-y-3">
      {disks.map((d, i) => {
        const pct = d.used_pct ?? (d.size_gb && d.free_gb != null ? Math.round(((d.size_gb - d.free_gb) / d.size_gb) * 100) : null);
        return (
          <div key={i} className="space-y-1.5 rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
              <span className="font-medium">{d.name ?? d.mount ?? `${t("endpoints.d.disk")} ${i + 1}`} <span className="text-xs text-muted-foreground">{[d.type, d.fs].filter(Boolean).join(" · ")}</span></span>
              <span className="font-mono text-xs text-muted-foreground">
                {d.free_gb != null && d.size_gb ? `${d.free_gb.toFixed(1)} / ${d.size_gb.toFixed(1)} GB ${t("endpoints.d.free")}` : d.size_gb ? `${d.size_gb.toFixed(1)} GB` : "—"}
              </span>
            </div>
            <div role="progressbar" aria-label={t("endpoints.d.usageOf").replace("{name}", d.name ?? d.mount ?? `${t("endpoints.d.disk")} ${i + 1}`)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${usageTone(pct)}`} style={{ width: `${pct ?? 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OsTab({ e }: { e: EP }) {
  const { t } = useI18n();
  const updates = e.pending_updates ?? [];
  const nics = e.network_interfaces ?? [];
  const dns = e.dns_servers ?? [];
  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <dl className="space-y-3">
          <Row label={t("endpoints.field.os")} value={[e.os, e.os_version].filter(Boolean).join(" ") || null} />
          <Row label={t("endpoints.d.domain")} value={e.domain} />
          <Row label={<><UserIcon aria-hidden className="mr-1 inline h-3 w-3" />{t("endpoints.d.loggedUser")}</>} value={e.logged_user} />
          <Row label={t("endpoints.d.timezone")} value={e.timezone} />
        </dl>
        <dl className="space-y-3">
          <Row label={t("endpoints.d.publicIp")} value={e.public_ip && <span className="font-mono">{e.public_ip}</span>} />
          <Row label="Gateway" value={e.gateway && <span className="font-mono">{e.gateway}</span>} />
          <Row label="DNS" value={dns.length ? <span className="font-mono text-xs">{dns.join(", ")}</span> : null} />
        </dl>
      </div>

      {nics.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Network aria-hidden className="h-3.5 w-3.5" />{t("endpoints.d.nics")}</h3>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2 text-left">{t("endpoints.d.nic")}</th><th className="p-2 text-left">IP</th><th className="p-2 text-left">MAC</th><th className="p-2 text-left">{t("endpoints.d.speed")}</th><th className="p-2 text-left">{t("endpoints.col.status")}</th></tr></thead>
              <tbody className="font-mono">
                {nics.map((n, i) => (
                  <tr key={i} className="border-t border-border/40"><td className="p-2">{n.name ?? "—"}</td><td className="p-2">{n.ip ?? "—"}</td><td className="p-2">{n.mac ?? "—"}</td><td className="p-2">{n.speed_mbps ? `${n.speed_mbps} Mbps` : "—"}</td><td className="p-2">{n.status ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Shield aria-hidden className="h-3.5 w-3.5" />{t("endpoints.d.pendingUpdates")} <Badge variant="secondary" className="text-[10px]">{updates.length}</Badge></h3>
        {updates.length === 0 ? <Empty label={t("endpoints.d.noUpdates")} /> : (
          <ul className="space-y-1 text-sm">
            {updates.map((u, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded border border-border/40 px-3 py-1.5">
                <span>{u.title ?? u.id ?? "—"} {u.kb && <span className="text-xs text-muted-foreground">({u.kb})</span>}</span>
                {u.severity && <Badge variant="outline" className="text-[10px]">{u.severity}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SoftwareTab({ e }: { e: EP }) {
  const { t } = useI18n();
  const soft = e.installed_software ?? [];
  if (!soft.length) return <Empty label={t("endpoints.d.noSoftware")} />;
  return (
    <div className="max-h-[600px] overflow-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2 text-left">{t("endpoints.d.name")}</th><th className="p-2 text-left">{t("endpoints.d.version")}</th><th className="p-2 text-left">{t("endpoints.d.publisher")}</th><th className="p-2 text-left">{t("endpoints.d.installed")}</th></tr></thead>
        <tbody>{soft.map((s, i) => (<tr key={i} className="border-t border-border/30"><td className="p-2">{s.name ?? "—"}</td><td className="p-2 font-mono">{s.version ?? "—"}</td><td className="p-2 text-muted-foreground">{s.publisher ?? "—"}</td><td className="p-2 text-muted-foreground">{s.install_date ?? "—"}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

function ProcessesTab({ e }: { e: EP }) {
  const { t } = useI18n();
  const procs = e.running_processes ?? [];
  if (!procs.length) return <Empty label={t("endpoints.d.noProcesses")} />;
  return (
    <div className="max-h-[600px] overflow-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2 text-left">{t("endpoints.d.process")}</th><th className="p-2 text-left">PID</th><th className="p-2 text-right">CPU %</th><th className="p-2 text-right">RAM</th><th className="p-2 text-left">{t("endpoints.d.user")}</th></tr></thead>
        <tbody className="font-mono">{procs.map((p, i) => (<tr key={i} className="border-t border-border/30"><td className="p-2">{p.name ?? "—"}</td><td className="p-2">{p.pid ?? "—"}</td><td className="p-2 text-right">{p.cpu != null ? p.cpu.toFixed(1) : "—"}</td><td className="p-2 text-right">{fmtBytes(p.ram_mb)}</td><td className="p-2 text-muted-foreground">{p.user ?? "—"}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

function ServicesTab({ e }: { e: EP }) {
  const { t } = useI18n();
  const svcs = e.services ?? [];
  if (!svcs.length) return <Empty label={t("endpoints.d.noServices")} />;
  return (
    <div className="max-h-[600px] overflow-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2 text-left">{t("endpoints.d.name")}</th><th className="p-2 text-left">{t("endpoints.d.description")}</th><th className="p-2 text-left">{t("endpoints.col.status")}</th><th className="p-2 text-left">{t("endpoints.d.startType")}</th></tr></thead>
        <tbody>{svcs.map((s, i) => (<tr key={i} className="border-t border-border/30"><td className="p-2 font-mono">{s.name ?? "—"}</td><td className="p-2 text-muted-foreground">{s.display_name ?? "—"}</td><td className="p-2">{s.status ?? "—"}</td><td className="p-2 text-muted-foreground">{s.start_type ?? "—"}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-xs text-muted-foreground">{label}</div>;
}

type Sample = { sampled_at: string; cpu_usage: number | null; ram_usage: number | null; disk_usage: number | null };

function MetricsChartCard({ samples }: { samples: Sample[] }) {
  const { t, lang } = useI18n();
  const data = samples.map((s) => ({
    t: new Date(s.sampled_at).getTime(),
    label: new Date(s.sampled_at).toLocaleTimeString(localeOf(lang), { hour: "2-digit", minute: "2-digit" }),
    cpu: s.cpu_usage ?? null,
    ram: s.ram_usage ?? null,
    disk: s.disk_usage ?? null,
  }));
  const avg = (k: "cpu" | "ram" | "disk") => {
    const vals = data.map((d) => d[k]).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  return (
    <Card className="border-border/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("endpoints.d.metrics")}</h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("endpoints.d.last24h")}</span>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />CPU {avg("cpu") ?? "—"}%</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-sky-500" />RAM {avg("ram") ?? "—"}%</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-amber-500" />{t("endpoints.d.disk")} {avg("disk") ?? "—"}%</span>
      </div>
      <div className="h-48" role="img" aria-label={t("endpoints.d.chartAria")}>
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{t("endpoints.d.waitingSamples")}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="g-cpu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.5} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                <linearGradient id="g-ram" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient>
                <linearGradient id="g-disk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Area type="monotone" dataKey="cpu" stroke="#10b981" fill="url(#g-cpu)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="ram" stroke="#0ea5e9" fill="url(#g-ram)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="disk" stroke="#f59e0b" fill="url(#g-disk)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

type ActivityItem = { id: string; action: string; summary: string | null; actor_email: string | null; created_at: string; entity_table: string };
function ActivityCard({ items }: { items: ActivityItem[] }) {
  const { t, lang } = useI18n();
  return (
    <Card className="border-border/60 p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("endpoints.d.activity")}</h3>
      {items.length === 0 ? <Empty label={t("endpoints.d.noActivity")} /> : (
        <ul className="space-y-3 text-xs">
          {items.map((a) => (
            <li key={a.id} className="break-words border-l-2 border-primary/40 pl-3">
              <p className="font-medium">{a.summary ?? a.action}</p>
              <p className="text-muted-foreground">{formatDateTime(a.created_at, lang)} {a.actor_email && `· ${a.actor_email}`}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AgentVersionInline({ version }: { version: string | null }) {
  const { t } = useI18n();
  if (!version) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-500">
        {t("endpoints.agent.none")}
      </Badge>
    );
  }
  const outdated = isAgentOutdated(version);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <span className="font-mono">{version}</span>
      {outdated ? (
        <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-500">
          {t("endpoints.agent.update")} → {LATEST_AGENT_VERSION}
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-500">
          {t("endpoints.agent.upToDate")}
        </Badge>
      )}
    </span>
  );
}

type AlertItem = { id: string; message: string; severity: "info" | "warning" | "critical"; status: string; created_at: string };
function AlertsListCard({ items }: { items: AlertItem[] }) {
  const { t, lang } = useI18n();
  return (
    <Card className="border-border/60 p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("alerts.title")}</h3>
      {items.length === 0 ? <Empty label={t("endpoints.d.noAlerts")} /> : (
        <ul className="space-y-2 text-xs">
          {items.slice(0, 10).map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 border-b border-border/30 pb-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate font-medium">{a.message}</p>
                <p className="text-muted-foreground">{formatDateTime(a.created_at, lang)}</p>
              </div>
              <Badge variant="outline" className={`shrink-0 text-[10px] uppercase ${a.severity === "critical" ? "border-destructive/40 text-destructive" : a.severity === "warning" ? "border-amber-500/40 text-amber-700 dark:text-amber-500" : "border-sky-500/40 text-sky-700 dark:text-sky-500"}`}>{t(`alerts.severity.${a.severity}` as TKey)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

