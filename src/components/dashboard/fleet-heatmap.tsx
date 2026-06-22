import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Grid3x3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const COLOR: Record<string, string> = {
  online: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
  offline: "bg-muted-foreground/40",
};

export function FleetHeatmap() {
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
        <Grid3x3 className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Mapa de saúde da frota</h2>
      </div>
      {!q.data || q.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sem endpoints.</p>
      ) : (
        <div className="space-y-3 max-h-72 overflow-auto pr-1">
          {q.data.map(([client, list]) => (
            <div key={client}>
              <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">{client} <span className="text-foreground/60">· {list.length}</span></p>
              <div className="flex flex-wrap gap-1">
                {list.map((e) => (
                  <Link
                    key={e.id}
                    to="/endpoints/$id"
                    params={{ id: e.id }}
                    title={`${e.hostname} — ${e.status}`}
                    className={`h-4 w-4 rounded-sm ${COLOR[e.status] ?? COLOR.offline} transition-transform hover:scale-125`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-3 text-[10px] text-muted-foreground">
        {(["online","warning","critical","offline"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-sm ${COLOR[s]}`} />{s}</span>
        ))}
      </div>
    </Card>
  );
}