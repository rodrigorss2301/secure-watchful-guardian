import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Grid3x3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";

const LABEL_KEY: Record<string, TKey> = {
  online: "endpoints.status.online",
  warning: "endpoints.status.warning",
  critical: "endpoints.status.critical",
  offline: "endpoints.status.offline",
};

const COLOR: Record<string, string> = {
  online: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
  offline: "bg-muted-foreground/40",
};

export function FleetHeatmap() {
  const { t } = useI18n();
  const label = (s: string) => (LABEL_KEY[s] ? t(LABEL_KEY[s]) : s);
  const { tenant } = useAuth();
  const q = useQuery({
    queryKey: ["fleet-heatmap", tenant?.id],
    enabled: !!tenant,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [eps, clients] = await Promise.all([
        supabase.from("endpoints").select("id,hostname,status,client_id,last_heartbeat"),
        supabase.from("clients").select("id,name"),
      ]);
      if (eps.error) throw eps.error;
      if (clients.error) throw clients.error;
      const cMap = new Map((clients.data ?? []).map((c) => [c.id, c.name]));
      const grouped = new Map<string, typeof eps.data>();
      for (const e of eps.data ?? []) {
        const k = cMap.get(e.client_id) ?? "—";
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k)!.push(e);
      }
      return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    },
  });

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Grid3x3 className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold">{t("dashboard.heatmap.title")}</h2>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : q.isError ? (
        <p role="alert" className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.heatmap.loadError")}</p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.heatmap.empty")}</p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-auto pr-1">
          {q.data.map(([client, list]) => (
            <div key={client}>
              <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">{client} <span className="text-foreground/60">· {list.length}</span></p>
              <div className="flex flex-wrap gap-1">
                {list.map((e) => (
                  <Link
                    key={e.id}
                    to="/endpoints/$id"
                    params={{ id: e.id }}
                    title={`${e.hostname} — ${label(e.status)}`}
                    aria-label={`${e.hostname}: ${label(e.status)}`}
                    className={`h-5 w-5 rounded-sm ${COLOR[e.status] ?? COLOR.offline} transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(["online","warning","critical","offline"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1"><span aria-hidden="true" className={`h-2 w-2 rounded-sm ${COLOR[s]}`} />{label(s)}</span>
        ))}
      </div>
    </Card>
  );
}