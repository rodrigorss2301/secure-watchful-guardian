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