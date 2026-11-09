import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

const LEVEL_TONE: Record<string, string> = {
  critical: "bg-destructive/20 text-destructive border-destructive/40",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-500 border-amber-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

const LEVEL_KEYS = new Set(["critical", "error", "warning", "info"]);

export function EventsTab({ endpointId }: { endpointId: string }) {
  const { t, lang } = useI18n();
  const [level, setLevel] = useState<string>("all");
  const [q, setQ] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
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
        <Input type="search" aria-label={t("events.search")} className="max-w-sm" placeholder={t("events.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger aria-label={t("events.level")} className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("events.allLevels")}</SelectItem>
            <SelectItem value="critical">{t("events.level.critical")}</SelectItem>
            <SelectItem value="error">{t("events.level.error")}</SelectItem>
            <SelectItem value="warning">{t("events.level.warning")}</SelectItem>
            <SelectItem value="info">{t("events.level.info")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" role="status" aria-label={t("common.loading")} />
      ) : isError ? (
        <Card role="alert" className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
          {t("events.loadError")}
          <Button variant="outline" size="sm" onClick={() => refetch()}>{t("common.retry")}</Button>
        </Card>
      ) : (data?.length ?? 0) === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {t("events.empty")}
        </Card>
      ) : (
        <div className="space-y-2">
          {data!.map((ev) => (
            <Card key={ev.id} className="p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className={LEVEL_TONE[ev.level] ?? ""}>{LEVEL_KEYS.has(ev.level) ? t(`events.level.${ev.level}` as TKey) : ev.level}</Badge>
                    {ev.provider && <span className="font-mono text-muted-foreground">{ev.provider}</span>}
                    {ev.event_id != null && <span className="text-muted-foreground">#{ev.event_id}</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{ev.message}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">{formatDateTime(ev.occurred_at, lang)}</time>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}