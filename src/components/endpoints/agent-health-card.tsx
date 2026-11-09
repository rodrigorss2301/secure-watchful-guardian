import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertTriangle, Activity, Clock, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

type Props = {
  endpoint: {
    id: string;
    agent_version?: string | null;
    update_channel?: string | null;
    agent_last_update_at?: string | null;
    agent_cpu_pct?: number | null;
    agent_ram_mb?: number | null;
    agent_heartbeat_duration_ms?: number | null;
    agent_queue_size?: number | null;
    agent_last_error?: string | null;
    agent_last_error_at?: string | null;
  };
  canWrite?: boolean;
};

export function AgentHealthCard({ endpoint, canWrite }: Props) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const channel = (endpoint.update_channel ?? "stable") as "stable" | "beta";
  const errorRecent = endpoint.agent_last_error_at
    ? Date.now() - new Date(endpoint.agent_last_error_at).getTime() < 2 * 60 * 60 * 1000
    : false;
  const queueHigh = (endpoint.agent_queue_size ?? 0) > 50;
  const unhealthy = errorRecent || queueHigh;

  const switchChannel = useMutation({
    mutationFn: async (next: "stable" | "beta") => {
      const { error } = await supabase
        .from("endpoints")
        .update({ update_channel: next })
        .eq("id", endpoint.id);
      if (error) throw error;
    },
    onSuccess: (_d, next) => {
      toast.success(t("endpoints.health.channelChanged").replace("{channel}", next));
      qc.invalidateQueries({ queryKey: ["endpoint", endpoint.id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("endpoints.health.channelFailed")),
  });

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {unhealthy ? <AlertTriangle aria-label={t("endpoints.health.attention")} className="h-4 w-4 text-destructive" /> : <ShieldCheck aria-label={t("endpoints.health.healthy")} className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />}
          <h3 className="font-semibold">{t("endpoints.health.title")}</h3>
        </div>
        <Badge variant={channel === "beta" ? "secondary" : "outline"} className="text-xs">{t("endpoints.health.channel").replace("{channel}", channel)}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat label={t("endpoints.health.version")} value={endpoint.agent_version ?? "—"} />
        <Stat label={t("endpoints.health.lastUpdate")} value={formatDateTime(endpoint.agent_last_update_at, lang)} />
        <Stat icon={Activity} label={t("endpoints.health.cpu")} value={endpoint.agent_cpu_pct != null ? `${endpoint.agent_cpu_pct.toFixed(1)}%` : "—"} />
        <Stat label={t("endpoints.health.ram")} value={endpoint.agent_ram_mb != null ? `${endpoint.agent_ram_mb} MB` : "—"} />
        <Stat icon={Clock} label={t("endpoints.health.latency")} value={endpoint.agent_heartbeat_duration_ms != null ? `${endpoint.agent_heartbeat_duration_ms} ms` : "—"} />
        <Stat icon={Inbox} label={t("endpoints.health.queue")} value={endpoint.agent_queue_size != null ? String(endpoint.agent_queue_size) : "—"} tone={queueHigh ? "danger" : undefined} />
      </dl>

      {endpoint.agent_last_error && (
        <div className={`mt-4 rounded-md border p-3 text-xs ${errorRecent ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-muted-foreground"}`}>
          <p className="font-semibold">{t("endpoints.health.lastError")} {endpoint.agent_last_error_at ? `(${formatDateTime(endpoint.agent_last_error_at, lang)})` : ""}</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px]">{endpoint.agent_last_error}</pre>
        </div>
      )}

      {canWrite && (
        <div className="mt-4 flex gap-2" role="group" aria-label={t("endpoints.health.updateChannel")}>
          <Button size="sm" variant={channel === "stable" ? "default" : "outline"} disabled={switchChannel.isPending || channel === "stable"} aria-pressed={channel === "stable"} onClick={() => switchChannel.mutate("stable")}>{t("endpoints.health.stable")}</Button>
          <Button size="sm" variant={channel === "beta" ? "default" : "outline"} disabled={switchChannel.isPending || channel === "beta"} aria-pressed={channel === "beta"} onClick={() => switchChannel.mutate("beta")}>{t("endpoints.health.beta")}</Button>
        </div>
      )}
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon?: typeof Activity; label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon aria-hidden className="h-3 w-3" />} {label}
      </dt>
      <dd className={`mt-0.5 break-words font-medium tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}>{value}</dd>
    </div>
  );
}