import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, MonitorSmartphone, TicketCheck, AlertTriangle,
  Activity, Zap, ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import {
  STATUS_TONE as EP_TONE, STATUS_DOT, ENDPOINT_STATUSES,
  TYPE_ICON, timeAgo, type EndpointStatus,
} from "@/lib/endpoints";
import {
  STATUS_TONE as TK_TONE, PRIORITY_TONE, TICKET_STATUSES, TICKET_PRIORITIES,
  slaState, type TicketStatus, type TicketPriority,
} from "@/lib/tickets";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Autotechs RMM" }] }),
  component: DashboardPage,
});

const STATUS_COLOR: Record<EndpointStatus, string> = {
  online: "hsl(160 84% 45%)",
  warning: "hsl(38 92% 55%)",
  critical: "hsl(0 84% 60%)",
  offline: "hsl(220 9% 55%)",
};

const TICKET_COLOR: Record<TicketStatus, string> = {
  open: "hsl(199 89% 55%)",
  in_progress: "hsl(262 83% 65%)",
  waiting: "hsl(38 92% 55%)",
  resolved: "hsl(160 84% 45%)",
  closed: "hsl(220 9% 55%)",
};

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  low: "hsl(220 9% 55%)",
  medium: "hsl(199 89% 55%)",
  high: "hsl(38 92% 55%)",
  urgent: "hsl(0 84% 60%)",
};

function DashboardPage() {
  const { t, lang } = useI18n();
  const { tenant } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", tenant?.id],
    enabled: !!tenant?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const [clientsRes, endpointsRes, ticketsRes, recentRes] = await Promise.all([
        supabase.from("clients").select("id,status"),
        supabase.from("endpoints").select("id,name,status,type,client_id,cpu_usage,ram_usage,disk_usage,last_seen_at"),
        supabase.from("tickets").select("id,status,priority,sla_due_at,created_at"),
        supabase.from("tickets")
          .select("id,number,title,status,priority,sla_due_at,created_at,client_id")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (endpointsRes.error) throw endpointsRes.error;
      if (ticketsRes.error) throw ticketsRes.error;
      if (recentRes.error) throw recentRes.error;

      const trend: { date: string; count: number }[] = [];
      const map = new Map<string, number>();
      for (const tk of ticketsRes.data ?? []) {
        if (!tk.created_at || tk.created_at < since) continue;
        const d = tk.created_at.slice(0, 10);
        map.set(d, (map.get(d) ?? 0) + 1);
      }
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        trend.push({ date: d, count: map.get(d) ?? 0 });
      }

      return {
        clients: clientsRes.data ?? [],
        endpoints: endpointsRes.data ?? [],
        tickets: ticketsRes.data ?? [],
        recent: recentRes.data ?? [],
        trend,
      };
    },
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const activeClients = data.clients.filter((c) => c.status === "active").length;
    const epByStatus: Record<EndpointStatus, number> = { online: 0, warning: 0, critical: 0, offline: 0 };
    for (const e of data.endpoints) epByStatus[e.status as EndpointStatus]++;
    const tkByStatus: Record<TicketStatus, number> = { open: 0, in_progress: 0, waiting: 0, resolved: 0, closed: 0 };
    const tkByPriority: Record<TicketPriority, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    let slaBreached = 0;
    let openTickets = 0;
    let urgent = 0;
    for (const tk of data.tickets) {
      tkByStatus[tk.status as TicketStatus]++;
      tkByPriority[tk.priority as TicketPriority]++;
      if (tk.status !== "resolved" && tk.status !== "closed") {
        openTickets++;
        if (tk.priority === "urgent") urgent++;
        if (slaState({ sla_due_at: tk.sla_due_at, status: tk.status }) === "breached") slaBreached++;
      }
    }
    return {
      activeClients,
      totalEndpoints: data.endpoints.length,
      epByStatus,
      tkByStatus,
      tkByPriority,
      openTickets,
      slaBreached,
      urgent,
      criticalEndpoints: data.endpoints.filter((e) => e.status === "critical" || e.status === "warning").slice(0, 6),
    };
  }, [data]);

  if (isLoading || !stats) {
    return (
      <>
        <PageHeader title={t("dashboard.title")} description={t("dashboard.subtitle")} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" /><Skeleton className="h-72" />
        </div>
      </>
    );
  }

  const epPie = ENDPOINT_STATUSES.map((s) => ({
    name: t(`endpoints.status.${s}` as TKey),
    value: stats.epByStatus[s],
    fill: STATUS_COLOR[s],
  })).filter((d) => d.value > 0);

  const tkBars = TICKET_STATUSES.map((s) => ({
    name: t(`tickets.status.${s}` as TKey),
    value: stats.tkByStatus[s],
    fill: TICKET_COLOR[s],
  }));

  const prBars = TICKET_PRIORITIES.map((p) => ({
    name: t(`tickets.priority.${p}` as TKey),
    value: stats.tkByPriority[p],
    fill: PRIORITY_COLOR[p],
  }));

  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "2-digit", month: "short" });

  return (
    <>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.subtitle")} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard icon={Building2} label={t("dashboard.kpi.clients")} value={stats.activeClients} tone="primary" />
        <KpiCard
          icon={MonitorSmartphone}
          label={t("dashboard.kpi.endpoints")}
          value={stats.totalEndpoints}
          tone="primary"
          sub={`${stats.epByStatus.online} ${t("dashboard.kpi.online").toLowerCase()} · ${stats.epByStatus.offline} ${t("dashboard.kpi.offline").toLowerCase()}`}
        />
        <KpiCard icon={TicketCheck} label={t("dashboard.kpi.openTickets")} value={stats.openTickets} tone="sky" />
        <KpiCard icon={AlertTriangle} label={t("dashboard.kpi.slaBreached")} value={stats.slaBreached} tone={stats.slaBreached > 0 ? "danger" : "muted"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("dashboard.section.ticketsTrend")}</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats ? (data?.trend ?? []) : []}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" width={24} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => fmtDay(String(v))}
                />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#trendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("dashboard.section.endpointsByStatus")}</h2>
          </div>
          <div className="h-64">
            {epPie.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">—</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={epPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {epPie.map((d, i) => <Cell key={i} fill={d.fill} stroke="hsl(var(--background))" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {ENDPOINT_STATUSES.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
                <span className="text-muted-foreground">{t(`endpoints.status.${s}` as TKey)}</span>
                <span className="ml-auto font-medium tabular-nums">{stats.epByStatus[s]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <TicketCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("dashboard.section.ticketsByStatus")}</h2>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tkBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" width={24} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {tkBars.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("dashboard.section.ticketsByPriority")}</h2>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={prBars} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis type="number" allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={70} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {prBars.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TicketCheck className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">{t("dashboard.section.recentTickets")}</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/tickets">{t("dashboard.viewAll")} <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
          {data!.recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("dashboard.empty.tickets")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data!.recent.map((tk) => {
                const sla = slaState({ sla_due_at: tk.sla_due_at, status: tk.status });
                return (
                  <li key={tk.id}>
                    <Link
                      to="/tickets/$id"
                      params={{ id: tk.id }}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded"
                    >
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">{tk.number}</span>
                      <span className="flex-1 truncate text-sm">{tk.title}</span>
                      <Badge variant="outline" className={PRIORITY_TONE[tk.priority as TicketPriority]}>
                        {t(`tickets.priority.${tk.priority}` as TKey)}
                      </Badge>
                      <Badge variant="outline" className={TK_TONE[tk.status as TicketStatus]}>
                        {t(`tickets.status.${tk.status}` as TKey)}
                      </Badge>
                      {sla === "breached" && <AlertTriangle className="h-4 w-4 text-destructive" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="font-semibold">{t("dashboard.section.criticalEndpoints")}</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/endpoints">{t("dashboard.viewAll")} <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
          {stats.criticalEndpoints.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("dashboard.empty.endpoints")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.criticalEndpoints.map((ep) => {
                const Icon = TYPE_ICON[ep.type as keyof typeof TYPE_ICON];
                return (
                  <li key={ep.id}>
                    <Link
                      to="/endpoints/$id"
                      params={{ id: ep.id }}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded"
                    >
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[ep.status as EndpointStatus]}`} />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm">{ep.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        CPU {ep.cpu_usage ?? "—"}% · RAM {ep.ram_usage ?? "—"}%
                      </span>
                      <Badge variant="outline" className={EP_TONE[ep.status as EndpointStatus]}>
                        {t(`endpoints.status.${ep.status}` as TKey)}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                        {timeAgo(ep.last_seen_at, "—")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  sub?: string;
  tone: "primary" | "sky" | "danger" | "muted";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    sky: "bg-sky-500/15 text-sky-500",
    danger: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}