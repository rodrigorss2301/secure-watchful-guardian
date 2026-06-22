import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const STATUS_TONE: Record<string, string> = {
  succeeded: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  timeout: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  expired: "bg-muted text-muted-foreground border-border",
  sent: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  pending: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function CommandsTimeline({ endpointId }: { endpointId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["endpoint-commands-timeline", endpointId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoint_commands")
        .select("id, command, params, status, output, timeout_seconds, signature, expires_at, created_at, sent_at, completed_at, failed_reason")
        .eq("endpoint_id", endpointId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!data || data.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum comando enviado a este endpoint.</Card>;
  }

  return (
    <div className="space-y-2">
      {data.map((c) => (
        <CommandRow key={c.id} cmd={c} />
      ))}
    </div>
  );
}

function CommandRow({ cmd }: { cmd: any }) {
  const [open, setOpen] = useState(false);
  const { data: logs } = useQuery({
    queryKey: ["command-logs", cmd.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoint_command_logs")
        .select("id, level, message, created_at")
        .eq("command_id", cmd.id)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  return (
    <Card className="p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="font-mono text-sm">{cmd.command}</span>
          <Badge variant="outline" className={STATUS_TONE[cmd.status] ?? ""}>{cmd.status}</Badge>
          {cmd.signature && <ShieldCheck className="h-3 w-3 text-emerald-500" aria-label="assinado" />}
          {cmd.timeout_seconds != null && <span className="text-xs text-muted-foreground">timeout {cmd.timeout_seconds}s</span>}
        </div>
        <time className="shrink-0 text-xs text-muted-foreground">{new Date(cmd.created_at).toLocaleString()}</time>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t pt-3 text-xs">
          <div className="grid grid-cols-2 gap-2 text-muted-foreground">
            <span>Enviado: {cmd.sent_at ? new Date(cmd.sent_at).toLocaleString() : "—"}</span>
            <span>Concluído: {cmd.completed_at ? new Date(cmd.completed_at).toLocaleString() : "—"}</span>
            <span>Expira: {cmd.expires_at ? new Date(cmd.expires_at).toLocaleString() : "—"}</span>
            <span>Motivo falha: {cmd.failed_reason ?? "—"}</span>
          </div>
          {cmd.output && (
            <div>
              <p className="mb-1 font-semibold">Saída</p>
              <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-2 font-mono">{cmd.output}</pre>
            </div>
          )}
          <div>
            <p className="mb-1 font-semibold">Log de execução ({logs?.length ?? 0})</p>
            {!logs || logs.length === 0 ? (
              <p className="text-muted-foreground">Sem linhas de log.</p>
            ) : (
              <div className="max-h-64 space-y-0.5 overflow-auto rounded bg-muted/40 p-2 font-mono">
                {logs.map((l) => (
                  <div key={l.id} className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-amber-500" : ""}>
                    <span className="text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</span>{" "}
                    {l.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}