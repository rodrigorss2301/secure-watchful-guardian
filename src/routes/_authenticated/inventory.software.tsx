import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Search } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/software")({
  head: () => ({ meta: [{ title: "Histórico de software — Autotechs RMM" }] }),
  component: SoftwareInventoryPage,
});

function SoftwareInventoryPage() {
  const { t, lang } = useI18n();
  const { tenant } = useAuth();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<"all" | "added" | "removed">("all");
  const [days, setDays] = useState("30");

  const q = useQuery({
    queryKey: ["sw-history", tenant?.id, days, action],
    enabled: !!tenant,
    queryFn: async () => {
      const since = new Date(Date.now() - parseInt(days) * 86_400_000).toISOString();
      let qb = supabase
        .from("endpoint_inventory_history")
        .select("id, endpoint_id, field, change_type, old_value, new_value, created_at, endpoints(hostname)")
        .eq("category", "software")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (action !== "all") qb = qb.eq("change_type", action);
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return q.data ?? [];
    return (q.data ?? []).filter((r: any) =>
      (r.field ?? "").toLowerCase().includes(s) ||
      (r.endpoints?.hostname ?? "").toLowerCase().includes(s));
  }, [q.data, search]);

  return (
    <>
      <PageHeader title={t("inventory.title")} description={t("inventory.subtitle")} />
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" aria-label={t("inventory.filter")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("inventory.filter")} className="pl-9" />
            </div>
            <Select value={action} onValueChange={(v) => setAction(v as never)}>
              <SelectTrigger aria-label={t("inventory.action")} className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("inventory.allActions")}</SelectItem>
                <SelectItem value="added">{t("inventory.installed")}</SelectItem>
                <SelectItem value="removed">{t("inventory.removed")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger aria-label={t("history.period")} className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("inventory.days7")}</SelectItem>
                <SelectItem value="14">{t("inventory.days14")}</SelectItem>
                <SelectItem value="30">{t("inventory.days30")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("inventory.col.when")}</TableHead>
                  <TableHead>{t("alerts.col.endpoint")}</TableHead>
                  <TableHead>{t("inventory.col.software")}</TableHead>
                  <TableHead>{t("inventory.col.version")}</TableHead>
                  <TableHead>{t("inventory.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground"><Package aria-hidden className="mx-auto h-5 w-5 animate-pulse" /><span className="sr-only" role="status">{t("common.loading")}</span></TableCell></TableRow>
                ) : q.isError ? (
                  <TableRow><TableCell colSpan={5} role="alert" className="py-10 text-center text-sm text-muted-foreground">{t("inventory.loadError")} <button type="button" onClick={() => q.refetch()} className="underline underline-offset-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("common.retry")}</button></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{t("inventory.empty")}</TableCell></TableRow>
                ) : filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.created_at, lang)}</TableCell>
                    <TableCell className="text-sm font-mono">{r.endpoints?.hostname ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.field}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.new_value ?? r.old_value ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.change_type === "added"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500"
                        : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-500"}>
                        {r.change_type === "added" ? t("inventory.badge.installed") : t("inventory.badge.removed")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}