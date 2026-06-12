import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, FileSpreadsheet, TicketCheck, Timer, Server, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n, type TKey } from "@/lib/i18n";
import { toast } from "sonner";
import {
  downloadCSV,
  fetchAlertsReport,
  fetchInventoryReport,
  fetchSLAReport,
  fetchTicketsReport,
  rangeToSince,
  toCSV,
  type ReportRange,
  type ReportRow,
} from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Autotechs RMM" }] }),
  component: ReportsPage,
});

type ReportId = "tickets" | "sla" | "inventory" | "alerts";

function ReportsPage() {
  const { t } = useI18n();
  const [range, setRange] = useState<ReportRange>("30d");
  const [tab, setTab] = useState<ReportId>("tickets");
  const since = useMemo(() => rangeToSince(range), [range]);

  const tickets = useQuery({ queryKey: ["report-tickets", range], queryFn: () => fetchTicketsReport(since) });
  const sla = useQuery({ queryKey: ["report-sla", range], queryFn: () => fetchSLAReport(since) });
  const inventory = useQuery({ queryKey: ["report-inventory"], queryFn: () => fetchInventoryReport() });
  const alerts = useQuery({ queryKey: ["report-alerts", range], queryFn: () => fetchAlertsReport(since) });

  const slaBreaches = (sla.data ?? []).filter((r) => r.sla_breached === "yes").length;
  const activeEndpoints = (inventory.data ?? []).filter((r) => r.status === "online").length;

  const handleExport = (id: ReportId, rows: ReportRow[]) => {
    if (rows.length === 0) {
      toast.error(t("reports.empty"));
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`${id}-${stamp}.csv`, toCSV(rows));
    toast.success(t("reports.toast.exported"));
  };

  const reportFor = (id: ReportId) => {
    switch (id) {
      case "tickets": return { rows: tickets.data ?? [], loading: tickets.isLoading, descKey: "reports.tickets.desc" as TKey };
      case "sla": return { rows: sla.data ?? [], loading: sla.isLoading, descKey: "reports.sla.desc" as TKey };
      case "inventory": return { rows: inventory.data ?? [], loading: inventory.isLoading, descKey: "reports.inventory.desc" as TKey };
      case "alerts": return { rows: alerts.data ?? [], loading: alerts.isLoading, descKey: "reports.alerts.desc" as TKey };
    }
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6 text-primary" /> {t("reports.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("reports.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("reports.range")}</span>
          <Select value={range} onValueChange={(v) => setRange(v as ReportRange)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t("reports.range.7d")}</SelectItem>
              <SelectItem value="30d">{t("reports.range.30d")}</SelectItem>
              <SelectItem value="90d">{t("reports.range.90d")}</SelectItem>
              <SelectItem value="all">{t("reports.range.all")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={TicketCheck} label={t("reports.kpi.tickets")} value={tickets.data?.length ?? 0} />
        <KpiCard icon={Timer} label={t("reports.kpi.slaBreaches")} value={slaBreaches} tone="warn" />
        <KpiCard icon={Server} label={t("reports.kpi.endpoints")} value={activeEndpoints} />
        <KpiCard icon={Bell} label={t("reports.kpi.alerts")} value={alerts.data?.length ?? 0} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportId)}>
        <TabsList>
          <TabsTrigger value="tickets">{t("reports.tab.tickets")}</TabsTrigger>
          <TabsTrigger value="sla">{t("reports.tab.sla")}</TabsTrigger>
          <TabsTrigger value="inventory">{t("reports.tab.inventory")}</TabsTrigger>
          <TabsTrigger value="alerts">{t("reports.tab.alerts")}</TabsTrigger>
        </TabsList>
        {(["tickets", "sla", "inventory", "alerts"] as ReportId[]).map((id) => {
          const { rows, loading, descKey } = reportFor(id);
          return (
            <TabsContent key={id} value={id} className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      {t(`reports.tab.${id}` as TKey)}
                      <span className="text-xs font-normal text-muted-foreground">· {rows.length} {t("reports.rows")}</span>
                    </CardTitle>
                    <CardDescription>{t(descKey)}</CardDescription>
                  </div>
                  <Button onClick={() => handleExport(id, rows)} disabled={loading || rows.length === 0}>
                    <Download className="mr-2 h-4 w-4" /> {t("reports.export")}
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs text-muted-foreground">{t("reports.preview")}</p>
                  <PreviewTable rows={rows.slice(0, 10)} loading={loading} emptyLabel={t("reports.empty")} />
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone }: { icon: typeof BarChart3; label: string; value: number; tone?: "warn" }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${tone === "warn" && value > 0 ? "text-destructive" : ""}`}>{value}</p>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function PreviewTable({ rows, loading, emptyLabel }: { rows: ReportRow[]; loading: boolean; emptyLabel: string }) {
  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">…</p>;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  const headers = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs uppercase tracking-wider">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {headers.map((h) => <TableCell key={h} className="whitespace-nowrap text-xs">{formatCell(r[h])}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v);
}