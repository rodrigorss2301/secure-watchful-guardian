import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell, BellRing, CheckCircle2, Plus, Play, Pencil, Trash2, Loader2, ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { AlertRuleFormDialog } from "@/components/alerts/alert-rule-form-dialog";
import {
  SEVERITY_TONE, STATUS_TONE, METRIC_ICON, COMPARATOR_SYMBOL,
  formatValue, relTime,
  type Alert, type AlertRule, type AlertSeverity, type AlertMetric, type AlertStatus,
} from "@/lib/alerts";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alertas — Autotechs RMM" }] }),
  component: AlertsPage,
});

function AlertsPage() {
  const { t } = useI18n();
  const { tenant, hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canWrite = hasAnyRole(["admin", "technician"]);

  const [tab, setTab] = useState<"active" | "history" | "rules">("active");
  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<AlertRule | null>(null);

  const { data: alerts, isLoading: loadingAlerts } = useQuery({
    queryKey: ["alerts", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*, endpoint:endpoints(id, hostname), client:clients(id, name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
    refetchInterval: 30_000,
  });

  const { data: rules, isLoading: loadingRules } = useQuery({
    queryKey: ["alert_rules", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_rules")
        .select("*, client:clients(id, name), endpoint:endpoints(id, hostname)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
  });

  const evaluate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("evaluate_alert_rules");
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      toast.success(`${t("alerts.evaluated")} (${n})`);
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ack = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alerts")
        .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("alerts.ack.done"));
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alerts")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("alerts.resolve.done"));
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("alert_rules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert_rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alert_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("alerts.rules.deleted"));
      qc.invalidateQueries({ queryKey: ["alert_rules"] });
      setDeletingRule(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = (alerts ?? []).filter((a) => a.status !== "resolved");
  const history = (alerts ?? []).filter((a) => a.status === "resolved");
  const openCount = active.filter((a) => a.status === "open").length;
  const ackCount = active.filter((a) => a.status === "acknowledged").length;
  const critCount = active.filter((a) => a.severity === "critical").length;
  const activeRulesCount = (rules ?? []).filter((r) => r.enabled).length;

  return (
    <>
      <PageHeader
        title={t("alerts.title")}
        description={t("alerts.subtitle")}
        actions={
          canWrite && (
            <Button onClick={() => evaluate.mutate()} disabled={evaluate.isPending} variant="outline">
              {evaluate.isPending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("alerts.evaluating")}</>
                : <><Play className="mr-2 h-4 w-4" />{t("alerts.evaluate")}</>}
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard icon={BellRing} label={t("alerts.kpi.open")} value={openCount} tone={openCount > 0 ? "danger" : "muted"} />
        <KpiCard icon={Bell} label={t("alerts.kpi.acknowledged")} value={ackCount} tone="warning" />
        <KpiCard icon={CheckCircle2} label={t("alerts.kpi.critical")} value={critCount} tone={critCount > 0 ? "danger" : "muted"} />
        <KpiCard icon={Bell} label={t("alerts.kpi.rules")} value={activeRulesCount} tone="primary" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="active">{t("alerts.tab.active")} {active.length > 0 && <Badge className="ml-2" variant="secondary">{active.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="history">{t("alerts.tab.history")}</TabsTrigger>
          <TabsTrigger value="rules">{t("alerts.tab.rules")}</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <AlertTable
            alerts={active}
            loading={loadingAlerts}
            emptyKey="alerts.empty.active"
            canWrite={canWrite}
            onAck={(id) => ack.mutate(id)}
            onResolve={(id) => resolve.mutate(id)}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <AlertTable
            alerts={history}
            loading={loadingAlerts}
            emptyKey="alerts.empty.history"
            canWrite={false}
          />
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          {canWrite && (
            <div className="mb-4 flex justify-end">
              <Button onClick={() => { setEditingRule(null); setRuleDialog(true); }}>
                <Plus className="mr-2 h-4 w-4" />{t("alerts.rules.new")}
              </Button>
            </div>
          )}
          <Card className="overflow-hidden">
            {loadingRules ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : (rules?.length ?? 0) === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">{t("alerts.empty.rules")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("alerts.rules.col.name")}</TableHead>
                    <TableHead>{t("alerts.rules.col.metric")}</TableHead>
                    <TableHead>{t("alerts.rules.col.condition")}</TableHead>
                    <TableHead>{t("alerts.rules.col.severity")}</TableHead>
                    <TableHead>{t("alerts.rules.col.scope")}</TableHead>
                    <TableHead className="text-center">{t("alerts.rules.col.enabled")}</TableHead>
                    {canWrite && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules!.map((r) => {
                    const MetricIcon = METRIC_ICON[r.metric];
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <MetricIcon className="h-4 w-4 text-muted-foreground" />
                            {t(`alerts.metric.${r.metric}` as TKey)}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.metric === "offline"
                            ? `> ${r.duration_minutes}m`
                            : `${COMPARATOR_SYMBOL[r.comparator]} ${r.threshold}% · ${r.duration_minutes}m`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={SEVERITY_TONE[r.severity]}>
                            {t(`alerts.severity.${r.severity}` as TKey)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t(`alerts.scope.${r.scope}` as TKey)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={r.enabled}
                            onCheckedChange={(v) => toggleRule.mutate({ id: r.id, enabled: v })}
                            disabled={!canWrite}
                          />
                        </TableCell>
                        {canWrite && (
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => { setEditingRule(r); setRuleDialog(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeletingRule(r)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <AlertRuleFormDialog open={ruleDialog} onOpenChange={setRuleDialog} rule={editingRule} />

      <AlertDialog open={!!deletingRule} onOpenChange={(o) => !o && setDeletingRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("alerts.action.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("alerts.rules.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingRule && deleteRule.mutate(deletingRule.id)}>
              {t("alerts.action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type AlertWithRels = Alert & {
  endpoint: { id: string; hostname: string } | null;
  client: { id: string; name: string } | null;
};

function AlertTable({
  alerts, loading, emptyKey, canWrite, onAck, onResolve,
}: {
  alerts: AlertWithRels[];
  loading: boolean;
  emptyKey: TKey;
  canWrite: boolean;
  onAck?: (id: string) => void;
  onResolve?: (id: string) => void;
}) {
  const { t } = useI18n();

  if (loading) {
    return (
      <Card className="p-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="p-12 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500/70" />
        <p className="mt-3 text-sm text-muted-foreground">{t(emptyKey)}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("alerts.col.severity")}</TableHead>
            <TableHead>{t("alerts.col.message")}</TableHead>
            <TableHead>{t("alerts.col.endpoint")}</TableHead>
            <TableHead>{t("alerts.col.metric")}</TableHead>
            <TableHead className="text-right">{t("alerts.col.value")}</TableHead>
            <TableHead>{t("alerts.col.status")}</TableHead>
            <TableHead>{t("alerts.col.created")}</TableHead>
            {canWrite && <TableHead className="w-40 text-right">{t("alerts.col.actions")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((a) => {
            const MetricIcon = METRIC_ICON[a.metric as AlertMetric];
            return (
              <TableRow key={a.id}>
                <TableCell>
                  <Badge variant="outline" className={SEVERITY_TONE[a.severity as AlertSeverity]}>
                    {t(`alerts.severity.${a.severity}` as TKey)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[280px] truncate">{a.message}</TableCell>
                <TableCell>
                  {a.endpoint ? (
                    <Link
                      to="/endpoints/$id"
                      params={{ id: a.endpoint.id }}
                      className="inline-flex items-center gap-1 text-sm hover:text-primary"
                    >
                      {a.endpoint.hostname}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </Link>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm">
                    <MetricIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    {t(`alerts.metric.${a.metric}` as TKey)}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {formatValue(a.metric as AlertMetric, a.value as number | null)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_TONE[a.status as AlertStatus]}>
                    {t(`alerts.status.${a.status}` as TKey)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground tabular-nums">
                  {relTime(a.created_at)}
                </TableCell>
                {canWrite && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {a.status === "open" && onAck && (
                        <Button size="sm" variant="ghost" onClick={() => onAck(a.id)}>
                          {t("alerts.action.ack")}
                        </Button>
                      )}
                      {a.status !== "resolved" && onResolve && (
                        <Button size="sm" variant="outline" onClick={() => onResolve(a.id)}>
                          {t("alerts.action.resolve")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function KpiCard({
  icon: Icon, label, value, tone,
}: {
  icon: typeof Bell;
  label: string;
  value: number;
  tone: "primary" | "warning" | "danger" | "muted";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-500/15 text-amber-500",
    danger: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{value}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}