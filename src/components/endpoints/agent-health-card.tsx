import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertTriangle, Activity, Clock, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      toast.success(`Canal alterado para ${next}`);
      qc.invalidateQueries({ queryKey: ["endpoint", endpoint.id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao alterar canal"),
  });

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {unhealthy ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-emerald-500" />}
          <h3 className="font-semibold">Saúde do agente</h3>
        </div>
        <Badge variant={channel === "beta" ? "secondary" : "outline"} className="text-xs">canal {channel}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Versão" value={endpoint.agent_version ?? "—"} />
        <Stat label="Último update" value={endpoint.agent_last_update_at ? new Date(endpoint.agent_last_update_at).toLocaleString() : "—"} />
        <Stat icon={Activity} label="CPU do agente" value={endpoint.agent_cpu_pct != null ? `${endpoint.agent_cpu_pct.toFixed(1)}%` : "—"} />
        <Stat label="RAM do agente" value={endpoint.agent_ram_mb != null ? `${endpoint.agent_ram_mb} MB` : "—"} />
        <Stat icon={Clock} label="Latência heartbeat" value={endpoint.agent_heartbeat_duration_ms != null ? `${endpoint.agent_heartbeat_duration_ms} ms` : "—"} />
        <Stat icon={Inbox} label="Fila offline" value={endpoint.agent_queue_size != null ? String(endpoint.agent_queue_size) : "—"} tone={queueHigh ? "danger" : undefined} />
      </dl>

      {endpoint.agent_last_error && (
        <div className={`mt-4 rounded-md border p-3 text-xs ${errorRecent ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-muted-foreground"}`}>
          <p className="font-semibold">Último erro {endpoint.agent_last_error_at ? `(${new Date(endpoint.agent_last_error_at).toLocaleString()})` : ""}</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px]">{endpoint.agent_last_error}</pre>
        </div>
      )}

      {canWrite && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant={channel === "stable" ? "default" : "outline"} disabled={switchChannel.isPending || channel === "stable"} onClick={() => switchChannel.mutate("stable")}>Stable</Button>
          <Button size="sm" variant={channel === "beta" ? "default" : "outline"} disabled={switchChannel.isPending || channel === "beta"} onClick={() => switchChannel.mutate("beta")}>Beta</Button>
        </div>
      )}
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon?: typeof Activity; label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </dt>
      <dd className={`mt-0.5 font-medium tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}>{value}</dd>
    </div>
  );
}