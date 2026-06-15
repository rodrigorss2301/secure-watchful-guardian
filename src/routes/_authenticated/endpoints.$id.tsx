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
import { EndpointFormDialog } from "@/components/endpoints/endpoint-form-dialog";
import { RemoteAccessDialog } from "@/components/endpoints/remote-access-dialog";
import { PowerDialog } from "@/components/endpoints/power-dialog";
import { InstallAgentDialog } from "@/components/endpoints/install-agent-dialog";
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
  const { t } = useI18n();
  const { hasAnyRole } = useAuth();
  const canWrite = hasAnyRole(["admin", "technician"]);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rdpOpen, setRdpOpen] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const [updateAgentOpen, setUpdateAgentOpen] = useState(false);

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
            <Button onClick={() => setRdpOpen(true)} className="shadow-glow">
              <MonitorPlay className="mr-2 h-4 w-4" />Acesso remoto
            </Button>
            <Button variant="outline" onClick={() => setPowerOpen(true)}>
              <Power className="mr-2 h-4 w-4" />Energia
            </Button>
            <Button variant="outline" onClick={() => setUpdateAgentOpen(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />Atualizar agente
            </Button>
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
                  <Row label={t("endpoints.field.agent")} value={<AgentVersionInline version={endpoint.agent_version} />} />
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
    warning: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    info: "bg-sky-500/15 text-sky-500 border-sky-500/30",
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
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <dl className="space-y-3">
        <Row label="CPU" value={e.cpu_model} />
        <Row label="Núcleos / Threads" value={e.cpu_cores || e.cpu_threads ? `${e.cpu_cores ?? "—"} / ${e.cpu_threads ?? "—"}` : null} />
        <Row label="RAM total" value={fmtBytes(e.ram_total_mb)} />
        <Row label="GPU" value={e.gpu} />
        <Row label="Fabricante" value={e.manufacturer} />
        <Row label="Modelo" value={e.model} />
        <Row label="Nº de série" value={e.serial_number && <span className="font-mono text-xs">{e.serial_number}</span>} />
        <Row label="Placa-mãe" value={e.motherboard} />
      </dl>
      <dl className="space-y-3">
        <Row label="BIOS" value={[e.bios_vendor, e.bios_version].filter(Boolean).join(" ") || null} />
        <Row label="Data BIOS" value={e.bios_date} />
        <Row label={<><Clock className="mr-1 inline h-3 w-3" />Uptime</>} value={fmtUptime(e.uptime_seconds)} />
        <Row label="Último boot" value={e.last_boot_at ? new Date(e.last_boot_at).toLocaleString() : null} />
        <Row label="Inventário atualizado" value={e.inventory_updated_at ? new Date(e.inventory_updated_at).toLocaleString() : null} />
      </dl>
    </div>
  );
}

function DisksTab({ e }: { e: EP }) {
  const disks = e.disks ?? [];
  if (!disks.length) return <Empty label="Sem dados de discos" />;
  return (
    <div className="space-y-3">
      {disks.map((d, i) => {
        const pct = d.used_pct ?? (d.size_gb && d.free_gb != null ? Math.round(((d.size_gb - d.free_gb) / d.size_gb) * 100) : null);
        return (
          <div key={i} className="space-y-1.5 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{d.name ?? d.mount ?? `Disk ${i + 1}`} <span className="text-xs text-muted-foreground">{[d.type, d.fs].filter(Boolean).join(" · ")}</span></span>
              <span className="font-mono text-xs text-muted-foreground">
                {d.free_gb != null && d.size_gb ? `${d.free_gb.toFixed(1)} / ${d.size_gb.toFixed(1)} GB livre` : d.size_gb ? `${d.size_gb.toFixed(1)} GB` : "—"}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${usageTone(pct)}`} style={{ width: `${pct ?? 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OsTab({ e }: { e: EP }) {
  const updates = e.pending_updates ?? [];
  const nics = e.network_interfaces ?? [];
  const dns = e.dns_servers ?? [];
  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <dl className="space-y-3">
          <Row label="Sistema operacional" value={[e.os, e.os_version].filter(Boolean).join(" ") || null} />
          <Row label="Domínio" value={e.domain} />
          <Row label={<><UserIcon className="mr-1 inline h-3 w-3" />Usuário logado</>} value={e.logged_user} />
          <Row label="Fuso horário" value={e.timezone} />
        </dl>
        <dl className="space-y-3">
          <Row label="IP público" value={e.public_ip && <span className="font-mono">{e.public_ip}</span>} />
          <Row label="Gateway" value={e.gateway && <span className="font-mono">{e.gateway}</span>} />
          <Row label="DNS" value={dns.length ? <span className="font-mono text-xs">{dns.join(", ")}</span> : null} />
        </dl>
      </div>

      {nics.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Network className="h-3.5 w-3.5" />Interfaces de rede</h3>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2 text-left">Interface</th><th className="p-2 text-left">IP</th><th className="p-2 text-left">MAC</th><th className="p-2 text-left">Velocidade</th><th className="p-2 text-left">Status</th></tr></thead>
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
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Shield className="h-3.5 w-3.5" />Atualizações pendentes <Badge variant="secondary" className="text-[10px]">{updates.length}</Badge></h3>
        {updates.length === 0 ? <Empty label="Nenhuma atualização pendente" /> : (
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
  const soft = e.installed_software ?? [];
  if (!soft.length) return <Empty label="Sem softwares inventariados" />;
  return (
    <div className="max-h-[600px] overflow-y-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2 text-left">Nome</th><th className="p-2 text-left">Versão</th><th className="p-2 text-left">Fornecedor</th><th className="p-2 text-left">Instalado</th></tr></thead>
        <tbody>{soft.map((s, i) => (<tr key={i} className="border-t border-border/30"><td className="p-2">{s.name ?? "—"}</td><td className="p-2 font-mono">{s.version ?? "—"}</td><td className="p-2 text-muted-foreground">{s.publisher ?? "—"}</td><td className="p-2 text-muted-foreground">{s.install_date ?? "—"}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

function ProcessesTab({ e }: { e: EP }) {
  const procs = e.running_processes ?? [];
  if (!procs.length) return <Empty label="Sem dados de processos" />;
  return (
    <div className="max-h-[600px] overflow-y-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2 text-left">Processo</th><th className="p-2 text-left">PID</th><th className="p-2 text-right">CPU %</th><th className="p-2 text-right">RAM</th><th className="p-2 text-left">Usuário</th></tr></thead>
        <tbody className="font-mono">{procs.map((p, i) => (<tr key={i} className="border-t border-border/30"><td className="p-2">{p.name ?? "—"}</td><td className="p-2">{p.pid ?? "—"}</td><td className="p-2 text-right">{p.cpu != null ? p.cpu.toFixed(1) : "—"}</td><td className="p-2 text-right">{fmtBytes(p.ram_mb)}</td><td className="p-2 text-muted-foreground">{p.user ?? "—"}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

function ServicesTab({ e }: { e: EP }) {
  const svcs = e.services ?? [];
  if (!svcs.length) return <Empty label="Sem dados de serviços" />;
  return (
    <div className="max-h-[600px] overflow-y-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2 text-left">Nome</th><th className="p-2 text-left">Descrição</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Início</th></tr></thead>
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
  const data = samples.map((s) => ({
    t: new Date(s.sampled_at).getTime(),
    label: new Date(s.sampled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
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
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Métricas</h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Últimas 24h</span>
      </div>
      <div className="mb-2 flex gap-4 text-[11px]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />CPU {avg("cpu") ?? "—"}%</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" />RAM {avg("ram") ?? "—"}%</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Disco {avg("disk") ?? "—"}%</span>
      </div>
      <div className="h-48">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Aguardando amostras…</div>
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
  return (
    <Card className="border-border/60 p-4">
      <h3 className="mb-3 text-sm font-semibold">Registro de atividades</h3>
      {items.length === 0 ? <Empty label="Sem atividades registradas" /> : (
        <ul className="space-y-3 text-xs">
          {items.map((a) => (
            <li key={a.id} className="border-l-2 border-primary/40 pl-3">
              <p className="font-medium">{a.summary ?? a.action}</p>
              <p className="text-muted-foreground">{new Date(a.created_at).toLocaleString()} {a.actor_email && `· ${a.actor_email}`}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type AlertItem = { id: string; message: string; severity: "info" | "warning" | "critical"; status: string; created_at: string };
function AlertsListCard({ items }: { items: AlertItem[] }) {
  return (
    <Card className="border-border/60 p-4">
      <h3 className="mb-3 text-sm font-semibold">Alertas</h3>
      {items.length === 0 ? <Empty label="Sem alertas" /> : (
        <ul className="space-y-2 text-xs">
          {items.slice(0, 10).map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 border-b border-border/30 pb-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate font-medium">{a.message}</p>
                <p className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
              </div>
              <Badge variant="outline" className={`shrink-0 text-[10px] uppercase ${a.severity === "critical" ? "border-destructive/40 text-destructive" : a.severity === "warning" ? "border-amber-500/40 text-amber-600" : "border-sky-500/40 text-sky-500"}`}>{a.severity}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

