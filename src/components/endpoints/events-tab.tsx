import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

const LEVEL_TONE: Record<string, string> = {
  critical: "bg-destructive/20 text-destructive border-destructive/40",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

export function EventsTab({ endpointId }: { endpointId: string }) {
  const [level, setLevel] = useState<string>("all");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["endpoint-events", endpointId, level, q],
    queryFn: async () => {
      let query = supabase
        .from("endpoint_events")
        .select("id, level, event_id, provider, message, occurred_at, source")
        .eq("endpoint_id", endpointId)
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (level !== "all") query = query.eq("level", level as "critical" | "error" | "warning" | "info");
      if (q.trim()) query = query.or(`message.ilike.%${q}%,provider.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-sm" placeholder="Buscar mensagem ou provedor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os níveis</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (data?.length ?? 0) === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum evento coletado ainda. O agente envia eventos críticos do Event Viewer a cada heartbeat (versão 1.6+).
        </Card>
      ) : (
        <div className="space-y-2">
          {data!.map((ev) => (
            <Card key={ev.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className={LEVEL_TONE[ev.level] ?? ""}>{ev.level}</Badge>
                    {ev.provider && <span className="font-mono text-muted-foreground">{ev.provider}</span>}
                    {ev.event_id != null && <span className="text-muted-foreground">#{ev.event_id}</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{ev.message}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">{new Date(ev.occurred_at).toLocaleString()}</time>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}