import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, FileSpreadsheet, TicketCheck, Timer, Server, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/app-shell";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
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
  head: () => ({ meta: [{ title: "Relatórios — Autotechs RMM" }] }),
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

  const errorFor = (id: ReportId) => ({ tickets: tickets.isError, sla: sla.isError, inventory: inventory.isError, alerts: alerts.isError })[id];

  const reportFor = (id: ReportId) => {
    switch (id) {
      case "tickets": return { rows: tickets.data ?? [], loading: tickets.isLoading, descKey: "reports.tickets.desc" as TKey };
      case "sla": return { rows: sla.data ?? [], loading: sla.isLoading, descKey: "reports.sla.desc" as TKey };
      case "inventory": return { rows: inventory.data ?? [], loading: inventory.isLoading, descKey: "reports.inventory.desc" as TKey };
      case "alerts": return { rows: alerts.data ?? [], loading: alerts.isLoading, descKey: "reports.alerts.desc" as TKey };
    }
  };

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.subtitle")}
        actions={(
          <div className="flex items-center gap-2">
            <span id="report-range-label" className="text-xs uppercase tracking-wider text-muted-foreground">{t("reports.range")}</span>
            <Select value={range} onValueChange={(v) => setRange(v as ReportRange)}>
              <SelectTrigger className="w-44" aria-labelledby="report-range-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{t("reports.range.7d")}</SelectItem>
                <SelectItem value="30d">{t("reports.range.30d")}</SelectItem>
                <SelectItem value="90d">{t("reports.range.90d")}</SelectItem>
                <SelectItem value="all">{t("reports.range.all")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={TicketCheck} label={t("reports.kpi.tickets")} value={tickets.data?.length ?? 0} />
        <KpiCard icon={Timer} label={t("reports.kpi.slaBreaches")} value={slaBreaches} tone="warn" />
        <KpiCard icon={Server} label={t("reports.kpi.endpoints")} value={activeEndpoints} />
        <KpiCard icon={Bell} label={t("reports.kpi.alerts")} value={alerts.data?.length ?? 0} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportId)}>
        <TabsList className="h-auto flex-wrap justify-start">
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
                <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden="true" />
                      {t(`reports.tab.${id}` as TKey)}
                      <span className="text-xs font-normal text-muted-foreground">· {rows.length} {t("reports.rows")}</span>
                    </CardTitle>
                    <CardDescription>{t(descKey)}</CardDescription>
                  </div>
                  <Button onClick={() => handleExport(id, rows)} disabled={loading || rows.length === 0}>
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" /> {t("reports.export")}
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs text-muted-foreground">{t("reports.preview")}</p>
                  <PreviewTable reportId={id} rows={rows.slice(0, 10)} loading={loading} error={errorFor(id)} />
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </>
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
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

// Valores de enum (status, prioridade...) por coluna e relatório, para exibir traduzidos no preview.
// O CSV exportado continua com os valores e cabeçalhos originais.
const VALUE_PREFIX: Record<ReportId, Record<string, string>> = {
  tickets: { status: "tickets.status", priority: "tickets.priority", category: "tickets.category" },
  sla: { status: "tickets.status", priority: "tickets.priority" },
  inventory: { status: "endpoints.status", type: "endpoints.type" },
  alerts: { status: "alerts.status", severity: "alerts.severity", metric: "alerts.metric" },
};

const COLUMN_KEYS = new Set([
  "number", "title", "client", "status", "priority", "category", "created_at", "resolved_at", "closed_at",
  "response_hours", "resolution_hours", "sla_due_at", "sla_breached", "hostname", "type", "os", "os_version",
  "ip_address", "agent_version", "cpu_usage", "ram_usage", "disk_usage", "last_heartbeat", "severity",
  "metric", "value", "threshold", "message", "endpoint",
]);

const ENUM_VALUES: Record<string, Set<string>> = {
  "tickets.status": new Set(["open", "in_progress", "waiting", "resolved", "closed"]),
  "tickets.priority": new Set(["low", "medium", "high", "urgent"]),
  "tickets.category": new Set(["incident", "request", "problem", "change", "question"]),
  "endpoints.status": new Set(["online", "offline", "warning", "critical"]),
  "endpoints.type": new Set(["workstation", "server", "mobile", "network"]),
  "alerts.status": new Set(["open", "acknowledged", "resolved"]),
  "alerts.severity": new Set(["info", "warning", "critical"]),
  "alerts.metric": new Set(["cpu", "ram", "disk", "offline"]),
};

function PreviewTable({ reportId, rows, loading, error }: { reportId: ReportId; rows: ReportRow[]; loading: boolean; error: boolean }) {
  const { t, lang } = useI18n();
  if (loading) return <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (error) return <p role="alert" className="py-8 text-center text-sm text-muted-foreground">{t("common.error")}</p>;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{t("reports.empty")}</p>;
  const headers = Object.keys(rows[0]);
  const headerLabel = (h: string) => (COLUMN_KEYS.has(h) ? t(`reports.col.${h}` as TKey) : h);
  const cellLabel = (h: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v, lang);
    if (h === "sla_breached") return v === "yes" ? t("reports.yes") : v === "no" ? t("reports.no") : String(v);
    const prefix = VALUE_PREFIX[reportId][h];
    if (prefix && ENUM_VALUES[prefix]?.has(String(v))) return t(`${prefix}.${String(v)}` as TKey);
    return String(v);
  };
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs uppercase tracking-wider">{headerLabel(h)}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {headers.map((h) => <TableCell key={h} className="whitespace-nowrap text-xs">{cellLabel(h, r[h])}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
