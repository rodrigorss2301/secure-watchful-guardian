import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

function fmtMin(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  return `${(m / 60).toFixed(1)}h`;
}

export function TopOutages() {
  const { t } = useI18n();
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
        <TrendingDown className="h-4 w-4 text-rose-500" aria-hidden="true" />
        <h2 className="font-semibold">{t("dashboard.outages.title")}</h2>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : q.isError ? (
        <p role="alert" className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.outages.loadError")}</p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.outages.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link to="/endpoints/$id" params={{ id: r.id }} className="-mx-2 flex min-h-10 items-center gap-3 rounded px-2 py-2 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex-1 truncate text-sm">{r.hostname}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{r.count} {r.count === 1 ? t("dashboard.outages.one") : t("dashboard.outages.many")}</span>
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 tabular-nums w-14 text-right">{fmtMin(r.sec)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}