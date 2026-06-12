import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Users, Calendar, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n, type TKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit — Autotechs RMM" }] }),
  component: AuditPage,
});

type AuditRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: "insert" | "update" | "delete";
  entity_table: string;
  entity_id: string | null;
  summary: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
};

const ENTITIES = ["clients", "endpoints", "automations", "alert_rules", "user_roles", "tickets"] as const;
const ACTIONS = ["insert", "update", "delete"] as const;

function AuditPage() {
  const { t } = useI18n();
  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [actor, setActor] = useState<string>("all");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const query = useQuery({
    queryKey: ["audit-logs", entity, action, actor],
    queryFn: async () => {
      let q = (supabase as any)
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (entity !== "all") q = q.eq("entity_table", entity);
      if (action !== "all") q = q.eq("action", action);
      if (actor !== "all") q = q.eq("actor_email", actor);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const rows = query.data ?? [];
  const actors = useMemo(() => Array.from(new Set(rows.map((r) => r.actor_email).filter(Boolean) as string[])), [rows]);
  const now = Date.now();
  const last30 = rows.filter((r) => now - new Date(r.created_at).getTime() < 30 * 86400000);
  const today = rows.filter((r) => new Date(r.created_at).toDateString() === new Date().toDateString());
  const uniqueActors = new Set(last30.map((r) => r.actor_email).filter(Boolean)).size;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ScrollText className="h-6 w-6 text-primary" /> {t("audit.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("audit.subtitle")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={ScrollText} label={t("audit.kpi.total")} value={last30.length} />
        <Kpi icon={Users} label={t("audit.kpi.actors")} value={uniqueActors} />
        <Kpi icon={Calendar} label={t("audit.kpi.today")} value={today.length} />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect label={t("audit.filter.entity")} value={entity} onChange={setEntity}
              options={[{ value: "all", label: t("audit.filter.all") }, ...ENTITIES.map((e) => ({ value: e, label: t(`audit.entity.${e}` as TKey) }))]} />
            <FilterSelect label={t("audit.filter.action")} value={action} onChange={setAction}
              options={[{ value: "all", label: t("audit.filter.all") }, ...ACTIONS.map((a) => ({ value: a, label: t(`audit.action.${a}` as TKey) }))]} />
            <FilterSelect label={t("audit.filter.actor")} value={actor} onChange={setActor}
              options={[{ value: "all", label: t("audit.filter.all") }, ...actors.map((a) => ({ value: a, label: a }))]} />
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("audit.col.when")}</TableHead>
                  <TableHead>{t("audit.col.actor")}</TableHead>
                  <TableHead>{t("audit.col.action")}</TableHead>
                  <TableHead>{t("audit.col.entity")}</TableHead>
                  <TableHead>{t("audit.col.summary")}</TableHead>
                  <TableHead className="text-right">{t("audit.col.details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{query.isLoading ? "…" : t("audit.empty")}</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{r.actor_email ?? "—"}</TableCell>
                    <TableCell><ActionBadge action={r.action} label={t(`audit.action.${r.action}` as TKey)} /></TableCell>
                    <TableCell className="text-xs">{t(`audit.entity.${r.entity_table}` as TKey) ?? r.entity_table}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs">{r.summary ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                        <Eye className="mr-1 h-3 w-3" /> {t("audit.viewDiff")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selected?.summary ?? selected?.entity_id ?? ""}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-3 sm:grid-cols-2">
              <DiffPane title={t("audit.diff.old")} value={selected.old_values} />
              <DiffPane title={t("audit.diff.new")} value={selected.new_values} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof ScrollText; label: string; value: number }) {
  return (
    <Card><CardContent className="flex items-center justify-between p-4">
      <div><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </CardContent></Card>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ActionBadge({ action, label }: { action: AuditRow["action"]; label: string }) {
  const variant: Record<AuditRow["action"], string> = {
    insert: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
    update: "border-blue-500/40 bg-blue-500/10 text-blue-500",
    delete: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  return <Badge variant="outline" className={`text-[10px] uppercase ${variant[action]}`}>{label}</Badge>;
}

function DiffPane({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <pre className="max-h-96 overflow-auto text-[11px] leading-relaxed">{value ? JSON.stringify(value, null, 2) : "—"}</pre>
    </div>
  );
}