import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

function fmtMin(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  return `${(m / 60).toFixed(1)}h`;
}

export function TopOutages() {
  const { tenant } = useAuth();
  const q = useQuery({
    queryKey: ["top-outages", tenant?.id],
    enabled: !!tenant,
    refetchInterval: 120_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [outages, eps] = await Promise.all([
        supabase.from("endpoint_outages").select("endpoint_id,duration_seconds,started_at,ended_at").gte("started_at", since),
        supabase.from("endpoints").select("id,hostname"),
      ]);
      if (outages.error) throw outages.error;
      if (eps.error) throw eps.error;
      const epMap = new Map((eps.data ?? []).map((e) => [e.id, e.hostname]));
      const agg = new Map<string, { count: number; sec: number }>();
      for (const o of outages.data ?? []) {
        const cur = agg.get(o.endpoint_id) ?? { count: 0, sec: 0 };
        cur.count++;
        cur.sec += o.duration_seconds ?? 0;
        agg.set(o.endpoint_id, cur);
      }
      return Array.from(agg.entries())
        .map(([id, v]) => ({ id, hostname: epMap.get(id) ?? "—", ...v }))
        .sort((a, b) => b.sec - a.sec)
        .slice(0, 8);
    },
  });

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-rose-500" />
        <h2 className="font-semibold">Top quedas (7 dias)</h2>
      </div>
      {!q.data || q.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sem quedas registradas.</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link to="/endpoints/$id" params={{ id: r.id }} className="flex items-center gap-3 py-2 hover:bg-muted/40 -mx-2 px-2 rounded">
                <span className="flex-1 truncate text-sm">{r.hostname}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{r.count} {r.count === 1 ? "queda" : "quedas"}</span>
                <span className="text-xs font-semibold text-rose-500 tabular-nums w-14 text-right">{fmtMin(r.sec)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}