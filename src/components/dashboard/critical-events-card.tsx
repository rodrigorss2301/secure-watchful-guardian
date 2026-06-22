import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertOctagon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function CriticalEventsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["critical-events-24h"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("endpoint_events")
        .select("id, level, provider, message, occurred_at, endpoint_id, endpoints(hostname)")
        .gte("occurred_at", since)
        .in("level", ["error", "critical"])
        .order("occurred_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <AlertOctagon className="h-4 w-4 text-destructive" />
        <h3 className="font-semibold">Eventos críticos (24h)</h3>
      </div>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento crítico nas últimas 24h.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {data.map((e: any) => (
            <li key={e.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className={e.level === "critical" ? "border-destructive/40 bg-destructive/20 text-destructive" : "border-destructive/30 bg-destructive/15 text-destructive"}>{e.level}</Badge>
                  <span className="font-mono text-muted-foreground">{e.endpoints?.hostname ?? "—"}</span>
                  {e.provider && <span className="text-muted-foreground">· {e.provider}</span>}
                </div>
                <p className="mt-0.5 truncate">{e.message}</p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">{new Date(e.occurred_at).toLocaleTimeString()}</time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}