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
        .limit: 25 as never;
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

      <Card className="border-border/60 p-5">
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("endpoints.detail.metrics")}
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <Metric icon={Cpu} label="CPU" value={endpoint.cpu_usage} />
          <Metric icon={MemoryStick} label="RAM" value={endpoint.ram_usage} />
          <Metric icon={HardDrive} label="Disco" value={endpoint.disk_usage} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 p-5">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("endpoints.detail.system")}
          </h2>
          <dl className="space-y-3">
            <Row label={t("endpoints.field.os")} value={[endpoint.os, endpoint.os_version].filter(Boolean).join(" ") || null} />
            <Row label={t("endpoints.field.agent")} value={endpoint.agent_version} />
            <Row label={t("endpoints.field.tags")} value={
              endpoint.tags.length
                ? (
                  <div className="flex flex-wrap gap-1">
                    {endpoint.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                  </div>
                )
                : null
            } />
          </dl>
        </Card>

        <Card className="border-border/60 p-5">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("endpoints.detail.network")}
          </h2>
          <dl className="space-y-3">
            <Row label={<><Globe className="mr-1 inline h-3 w-3" />IP</>} value={endpoint.ip_address && <span className="font-mono">{endpoint.ip_address}</span>} />
            <Row label={<><Hash className="mr-1 inline h-3 w-3" />MAC</>} value={endpoint.mac_address && <span className="font-mono">{endpoint.mac_address}</span>} />
            <Row label={<><Wifi className="mr-1 inline h-3 w-3" />Last ping</>} value={endpoint.last_heartbeat ? new Date(endpoint.last_heartbeat).toLocaleString() : null} />
          </dl>
        </Card>
      </div>

      {endpoint.notes && (
        <Card className="border-border/60 p-5">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("endpoints.field.notes")}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{endpoint.notes}</p>
        </Card>
      )}

      <InventorySections endpoint={endpoint} />

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

function InventorySections({ endpoint }: { endpoint: EndpointRow }) {
  const e = endpoint as EndpointRow & {
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

  const disks = e.disks ?? [];
  const nics = e.network_interfaces ?? [];
  const soft = e.installed_software ?? [];
  const procs = e.running_processes ?? [];
  const svcs = e.services ?? [];
  const updates = e.pending_updates ?? [];
  const dns = e.dns_servers ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={Cpu} title="Hardware">
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
        </Section>

        <Section icon={Shield} title="BIOS & Sistema">
          <dl className="space-y-3">
            <Row label="BIOS" value={[e.bios_vendor, e.bios_version].filter(Boolean).join(" ") || null} />
            <Row label="Data BIOS" value={e.bios_date} />
            <Row label={<><Clock className="mr-1 inline h-3 w-3" />Uptime</>} value={fmtUptime(e.uptime_seconds)} />
            <Row label="Último boot" value={e.last_boot_at ? new Date(e.last_boot_at).toLocaleString() : null} />
            <Row label="Fuso horário" value={e.timezone} />
            <Row label="Domínio" value={e.domain} />
            <Row label={<><UserIcon className="mr-1 inline h-3 w-3" />Usuário logado</>} value={e.logged_user} />
            <Row label="Inventário atualizado" value={e.inventory_updated_at ? new Date(e.inventory_updated_at).toLocaleString() : null} />
          </dl>
        </Section>
      </div>

      <Section icon={Network} title="Rede">
        <dl className="grid gap-3 md:grid-cols-2">
          <Row label="IP público" value={e.public_ip && <span className="font-mono">{e.public_ip}</span>} />
          <Row label="Gateway" value={e.gateway && <span className="font-mono">{e.gateway}</span>} />
          <Row label="DNS" value={dns.length ? <span className="font-mono text-xs">{dns.join(", ")}</span> : null} />
        </dl>
        {nics.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60"><th className="py-2 text-left">Interface</th><th className="text-left">IP</th><th className="text-left">MAC</th><th className="text-left">Velocidade</th><th className="text-left">Status</th></tr>
              </thead>
              <tbody className="font-mono">
                {nics.map((n, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1.5">{n.name ?? "—"}</td>
                    <td>{n.ip ?? "—"}</td>
                    <td>{n.mac ?? "—"}</td>
                    <td>{n.speed_mbps ? `${n.speed_mbps} Mbps` : "—"}</td>
                    <td>{n.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {disks.length > 0 && (
        <Section icon={HardDrive} title="Discos" count={disks.length}>
          <div className="space-y-3">
            {disks.map((d, i) => {
              const pct = d.used_pct ?? (d.size_gb && d.free_gb != null ? Math.round(((d.size_gb - d.free_gb) / d.size_gb) * 100) : null);
              return (
                <div key={i} className="space-y-1.5">
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
        </Section>
      )}

      {soft.length > 0 && (
        <Section icon={Package} title="Softwares instalados" count={soft.length}>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr className="border-b border-border/60"><th className="py-2 text-left">Nome</th><th className="text-left">Versão</th><th className="text-left">Fornecedor</th><th className="text-left">Instalado</th></tr>
              </thead>
              <tbody>
                {soft.map((s, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1.5">{s.name ?? "—"}</td>
                    <td className="font-mono">{s.version ?? "—"}</td>
                    <td className="text-muted-foreground">{s.publisher ?? "—"}</td>
                    <td className="text-muted-foreground">{s.install_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {updates.length > 0 && (
        <Section icon={Shield} title="Atualizações pendentes" count={updates.length}>
          <ul className="space-y-1.5 text-sm">
            {updates.map((u, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-border/30 py-1.5">
                <span>{u.title ?? u.id ?? "—"} {u.kb && <span className="text-xs text-muted-foreground">({u.kb})</span>}</span>
                {u.severity && <Badge variant="outline" className="text-[10px]">{u.severity}</Badge>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {procs.length > 0 && (
        <Section icon={ListTree} title="Processos em execução" count={procs.length}>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr className="border-b border-border/60"><th className="py-2 text-left">Processo</th><th className="text-left">PID</th><th className="text-right">CPU %</th><th className="text-right">RAM</th><th className="text-left">Usuário</th></tr>
              </thead>
              <tbody className="font-mono">
                {procs.map((p, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1.5">{p.name ?? "—"}</td>
                    <td>{p.pid ?? "—"}</td>
                    <td className="text-right">{p.cpu != null ? p.cpu.toFixed(1) : "—"}</td>
                    <td className="text-right">{fmtBytes(p.ram_mb)}</td>
                    <td className="text-muted-foreground">{p.user ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {svcs.length > 0 && (
        <Section icon={ServerIcon} title="Serviços" count={svcs.length}>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr className="border-b border-border/60"><th className="py-2 text-left">Nome</th><th className="text-left">Descrição</th><th className="text-left">Status</th><th className="text-left">Início</th></tr>
              </thead>
              <tbody>
                {svcs.map((s, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1.5 font-mono">{s.name ?? "—"}</td>
                    <td className="text-muted-foreground">{s.display_name ?? "—"}</td>
                    <td>{s.status ?? "—"}</td>
                    <td className="text-muted-foreground">{s.start_type ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}