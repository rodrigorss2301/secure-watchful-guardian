import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Play, Pencil, Trash2, Plus, Search, Workflow, Power, PowerOff,
  CheckCircle2, AlertTriangle, History, Library,
} from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { AutomationFormDialog } from "@/components/automations/automation-form-dialog";
import { LibraryDialog } from "@/components/automations/library-dialog";
import { ApprovalsTab } from "@/components/automations/approvals-tab";
import {
  KIND_ICON, LANGUAGE_ICON, RUN_STATUS_TONE, TRIGGER_ICON, TRIGGER_TONE,
  formatDuration, relTime,
  type Automation, type AutomationRun, type AutomationRunStatus,
} from "@/lib/automations";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({ meta: [{ title: "Automations — Autotechs RMM" }] }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const { t } = useI18n();
  const { tenant, hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "technician"]);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Automation | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [openLibrary, setOpenLibrary] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null);
  const [runDetail, setRunDetail] = useState<AutomationRun | null>(null);

  const { data: automations, isLoading } = useQuery({
    queryKey: ["automations", tenant?.id],
    queryFn: async (): Promise<Automation[]> => {
      const { data, error } = await supabase.from("automations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenant,
  });

  const { data: runs } = useQuery({
    queryKey: ["automation-runs", tenant?.id],
    queryFn: async (): Promise<(AutomationRun & { automation?: { name: string } | null; endpoint?: { hostname: string } | null })[]> => {
      const { data, error } = await supabase
        .from("automation_runs")
        .select("*, automation:automations(name), endpoint:endpoints(hostname)")
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as never;
    },
    enabled: !!tenant,
    refetchInterval: 15_000,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (automations ?? []).filter((a) =>
      !s || a.name.toLowerCase().includes(s) || (a.description ?? "").toLowerCase().includes(s));
  }, [automations, search]);

  const kpis = useMemo(() => {
    const total = automations?.length ?? 0;
    const enabled = automations?.filter((a) => a.enabled).length ?? 0;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const recent = (runs ?? []).filter((r) => new Date(r.started_at).getTime() >= weekAgo);
    return { total, enabled, runs: recent.length, failures: recent.filter((r) => r.status === "failed").length };
  }, [automations, runs]);

  const runMutation = useMutation({
    mutationFn: async (id: string): Promise<number> => {
      const { data, error } = await supabase.rpc("run_automation", { _automation_id: id });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (n) => {
      if (n === 0) toast.info(t("automations.run.none"));
      else toast.success(t("automations.run.success").replace("{n}", String(n)));
      qc.invalidateQueries({ queryKey: ["automation-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: async (a: Automation) => {
      const { error } = await supabase.from("automations").update({ enabled: !a.enabled }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("automations.deleted"));
      qc.invalidateQueries({ queryKey: ["automations"] });
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={t("automations.title")}
        description={t("automations.subtitle")}
        actions={canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpenLibrary(true)}>
              <Library className="mr-2 h-4 w-4" /> Biblioteca
            </Button>
            <Button onClick={() => { setEditing(null); setOpenForm(true); }} className="shadow-glow">
              <Plus className="mr-2 h-4 w-4" /> {t("automations.new")}
            </Button>
          </div>
        )}
      />

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <Kpi icon={Workflow} label={t("automations.kpi.total")} value={kpis.total} />
        <Kpi icon={Power} label={t("automations.kpi.enabled")} value={kpis.enabled} tone="text-emerald-500" />
        <Kpi icon={History} label={t("automations.kpi.runs")} value={kpis.runs} tone="text-sky-500" />
        <Kpi icon={AlertTriangle} label={t("automations.kpi.failures")} value={kpis.failures} tone="text-destructive" />
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">{t("automations.tab.list")}</TabsTrigger>
          <TabsTrigger value="runs">{t("automations.tab.runs")}</TabsTrigger>
          <TabsTrigger value="approvals">Aprovações</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("automations.search")} className="pl-9" />
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("automations.col.name")}</TableHead>
                  <TableHead>{t("automations.col.trigger")}</TableHead>
                  <TableHead>{t("automations.col.scope")}</TableHead>
                  <TableHead>{t("automations.col.language")}</TableHead>
                  <TableHead>{t("automations.col.enabled")}</TableHead>
                  <TableHead className="text-right">{t("automations.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{t("automations.empty")}</TableCell></TableRow>
                ) : filtered.map((a) => {
                  const Kind = KIND_ICON[a.kind];
                  const Lang = LANGUAGE_ICON[a.language];
                  const Trig = TRIGGER_ICON[a.trigger];
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Kind className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col">
                            <span className="font-medium">{a.name}</span>
                            {a.description && <span className="text-xs text-muted-foreground line-clamp-1">{a.description}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={TRIGGER_TONE[a.trigger]}>
                          <Trig className="mr-1 h-3 w-3" /> {t(`automations.trigger.${a.trigger}` as TKey)}
                          {a.trigger === "schedule" && a.cron_expr && <span className="ml-1 font-mono text-[10px]">{a.cron_expr}</span>}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{t(`automations.scope.${a.scope}` as TKey)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <Lang className="h-3.5 w-3.5 text-muted-foreground" />
                          {t(`automations.language.${a.language}` as TKey)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {a.enabled
                          ? <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">●</Badge>
                          : <Badge variant="outline" className="border-border bg-muted text-muted-foreground">○</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button size="sm" variant="ghost" disabled={runMutation.isPending}
                              onClick={() => runMutation.mutate(a.id)} title={t("automations.run.now")}>
                              {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="sm" variant="ghost" onClick={() => toggleEnabled.mutate(a)} title={a.enabled ? "Disable" : "Enable"}>
                              {a.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setOpenForm(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {hasAnyRole(["admin"]) && (
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                              onClick={() => setPendingDelete(a)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("automations.col.name")}</TableHead>
                  <TableHead>{t("automations.col.endpoint")}</TableHead>
                  <TableHead>{t("automations.col.status")}</TableHead>
                  <TableHead>{t("automations.col.duration")}</TableHead>
                  <TableHead>{t("automations.col.exit")}</TableHead>
                  <TableHead>{t("automations.col.started")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{t("automations.runs.empty")}</TableCell></TableRow>
                ) : (runs ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.automation?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm font-mono">{r.endpoint?.hostname ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-sm">{formatDuration(r.duration_ms)}</TableCell>
                    <TableCell className="text-sm font-mono">{r.exit_code ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{relTime(r.started_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setRunDetail(r)}>{t("automations.runs.viewOutput")}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          <ApprovalsTab />
        </TabsContent>
      </Tabs>

      <AutomationFormDialog open={openForm} onOpenChange={setOpenForm} automation={editing} />
      <LibraryDialog open={openLibrary} onOpenChange={setOpenLibrary} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelete?.name}</AlertDialogTitle>
            <AlertDialogDescription>{t("automations.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && remove.mutate(pendingDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete" as TKey)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!runDetail} onOpenChange={(o) => !o && setRunDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {runDetail?.status === "success"
                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                : <AlertTriangle className="h-5 w-5 text-destructive" />}
              {t("automations.runs.viewOutput")}
            </DialogTitle>
            <DialogDescription>
              exit: <span className="font-mono">{runDetail?.exit_code ?? "—"}</span> · {formatDuration(runDetail?.duration_ms ?? null)}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
            {runDetail?.output || runDetail?.error || "—"}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Workflow; label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${tone ?? "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${tone ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: AutomationRunStatus }) {
  const { t } = useI18n();
  return <Badge variant="outline" className={RUN_STATUS_TONE[status]}>{t(`automations.runStatus.${status}` as TKey)}</Badge>;
}