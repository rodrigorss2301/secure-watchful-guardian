import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Cpu, Network, Package, MonitorSmartphone, History, ArrowRight, Plus, Minus, WifiOff, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Category = "all" | "hardware" | "network" | "software" | "os";
type PeriodDays = 1 | 7 | 14 | 30;
const PERIOD_OPTIONS: { days: PeriodDays; label: string }[] = [
  { days: 1,  label: "24h" },
  { days: 7,  label: "7 dias" },
  { days: 14, label: "14 dias" },
  { days: 30, label: "30 dias" },
];
type HistoryRow = {
  id: string;
  category: string;
  field: string;
  change_type: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

const CAT_LABEL: Record<string, { label: string; icon: typeof Cpu; tone: string }> = {
  hardware: { label: "Hardware", icon: Cpu,               tone: "border-purple-500/40 text-purple-500" },
  network:  { label: "Rede",     icon: Network,           tone: "border-sky-500/40 text-sky-500" },
  software: { label: "Software", icon: Package,           tone: "border-emerald-500/40 text-emerald-500" },
  os:       { label: "SO",       icon: MonitorSmartphone, tone: "border-amber-500/40 text-amber-600" },
};

const FIELD_LABEL: Record<string, string> = {
  cpu_model: "Modelo da CPU", cpu_cores: "Núcleos", ram_total_mb: "RAM total (MB)",
  gpu: "GPU", manufacturer: "Fabricante", model: "Modelo", serial_number: "Número de série",
  motherboard: "Placa-mãe", bios_version: "BIOS", disks: "Discos",
  ip_address: "IP privado", public_ip: "IP público", gateway: "Gateway",
  mac_address: "MAC", tailscale_ip: "IP Tailscale", dns_servers: "Servidores DNS",
  interfaces: "Interfaces de rede", os: "Sistema operacional", os_version: "Versão do SO",
};

export function HistoryTab({ endpointId }: { endpointId: string }) {
  const [cat, setCat] = useState<Category>("all");
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const periodLabel = PERIOD_OPTIONS.find((p) => p.days === periodDays)!.label;

  const since = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - periodDays); return d.toISOString();
  }, [periodDays]);

  const { data: outages } = useQuery({
    queryKey: ["endpoint-outages", endpointId, periodDays],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoint_outages" as never)
        .select("id, started_at, ended_at, duration_seconds, reason")
        .eq("endpoint_id", endpointId)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; started_at: string; ended_at: string | null; duration_seconds: number | null; reason: string }[];
    },
    refetchInterval: 60_000,
  });

  const uptime = useMemo(() => {
    const total = periodDays * 24 * 3600;
    const sinceMs = new Date(since).getTime();
    let down = 0;
    for (const o of outages ?? []) {
      const start = Math.max(new Date(o.started_at).getTime(), sinceMs);
      const end = o.ended_at ? new Date(o.ended_at).getTime() : Date.now();
      down += Math.max(0, Math.round((end - start) / 1000));
    }
    const pct = Math.max(0, Math.min(100, ((total - down) / total) * 100));
    return { pct, downSeconds: down, outageCount: (outages ?? []).length };
  }, [outages, since, periodDays]);

  // Build connectivity timeseries (uptime % per bucket) from outages
  const connectivity = useMemo(() => {
    const sinceMs = new Date(since).getTime();
    const nowMs = Date.now();
    // For 24h: hourly buckets; otherwise daily buckets
    const hourly = periodDays === 1;
    const bucketMs = hourly ? 3600_000 : 86400_000;
    const start = hourly
      ? Math.floor(sinceMs / bucketMs) * bucketMs
      : (() => { const d = new Date(sinceMs); d.setHours(0,0,0,0); return d.getTime(); })();
    const buckets: { ts: number; downMs: number }[] = [];
    for (let t = start; t <= nowMs; t += bucketMs) buckets.push({ ts: t, downMs: 0 });
    for (const o of outages ?? []) {
      const s = new Date(o.started_at).getTime();
      const e = o.ended_at ? new Date(o.ended_at).getTime() : nowMs;
      for (const b of buckets) {
        const bs = b.ts, be = b.ts + bucketMs;
        const overlap = Math.max(0, Math.min(e, be) - Math.max(s, bs));
        if (overlap > 0) b.downMs += overlap;
      }
    }
    return buckets.map((b) => {
      const span = Math.min(bucketMs, nowMs - b.ts);
      const pct = span > 0 ? Math.max(0, Math.min(100, ((span - b.downMs) / span) * 100)) : 100;
      const d = new Date(b.ts);
      const label = hourly
        ? `${String(d.getHours()).padStart(2, "0")}:00`
        : d.toISOString().slice(5, 10);
      return { label, uptime: Math.round(pct * 100) / 100 };
    });
  }, [outages, since, periodDays]);

  const { data: changes, isLoading } = useQuery({
    queryKey: ["endpoint-history", endpointId, cat, periodDays],
    queryFn: async () => {
      let q = supabase
        .from("endpoint_inventory_history" as never)
        .select("id, category, field, change_type, old_value, new_value, created_at")
        .eq("endpoint_id", endpointId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cat !== "all") q = q.eq("category", cat);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as HistoryRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: samples } = useQuery({
    queryKey: ["endpoint-samples", endpointId, periodDays],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoint_metric_samples")
        .select("sampled_at, cpu_usage, ram_usage, disk_usage")
        .eq("endpoint_id", endpointId)
        .gte("sampled_at", since)
        .order("sampled_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5 * 60_000,
  });

  // Aggregate samples into daily buckets for the 30d chart
  const daily = useMemo(() => {
    if (!samples?.length) return [] as { label: string; cpu: number | null; ram: number | null; disk: number | null }[];
    const buckets = new Map<string, { cpuSum: number; cpuN: number; ramSum: number; ramN: number; diskSum: number; diskN: number }>();
    for (const s of samples) {
      const k = new Date(s.sampled_at).toISOString().slice(0, 10);
      const b = buckets.get(k) ?? { cpuSum: 0, cpuN: 0, ramSum: 0, ramN: 0, diskSum: 0, diskN: 0 };
      if (s.cpu_usage != null) { b.cpuSum += Number(s.cpu_usage); b.cpuN++; }
      if (s.ram_usage != null) { b.ramSum += Number(s.ram_usage); b.ramN++; }
      if (s.disk_usage != null) { b.diskSum += Number(s.disk_usage); b.diskN++; }
      buckets.set(k, b);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, b]) => ({
      label: k.slice(5),
      cpu:  b.cpuN  ? Math.round(b.cpuSum  / b.cpuN)  : null,
      ram:  b.ramN  ? Math.round(b.ramSum  / b.ramN)  : null,
      disk: b.diskN ? Math.round(b.diskSum / b.diskN) : null,
    }));
  }, [samples]);

  const counts = useMemo(() => {
    const c = { hardware: 0, network: 0, software: 0, os: 0 };
    for (const r of changes ?? []) c[r.category as keyof typeof c] = (c[r.category as keyof typeof c] ?? 0) + 1;
    return c;
  }, [changes]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Período</span>
        <div className="flex flex-wrap gap-1">
          {PERIOD_OPTIONS.map((p) => (
            <Button
              key={p.days}
              type="button" size="sm"
              variant={periodDays === p.days ? "default" : "outline"}
              onClick={() => setPeriodDays(p.days)}
              className="h-7 px-2.5 text-[11px]"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="border-border/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Wifi className="h-4 w-4" /> Conectividade
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Últimos {periodLabel}</span>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Uptime" value={`${uptime.pct.toFixed(2)}%`} tone={uptime.pct >= 99 ? "text-emerald-500" : uptime.pct >= 95 ? "text-amber-500" : "text-destructive"} />
          <Stat label="Quedas" value={String(uptime.outageCount)} tone="text-foreground" />
          <Stat label="Tempo fora" value={formatDuration(uptime.downSeconds)} tone={uptime.downSeconds > 0 ? "text-destructive" : "text-foreground"} />
        </div>
        {(outages ?? []).length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Sem quedas registradas nos últimos {periodLabel}.</p>
        ) : (
          <ul className="space-y-2">
            {(outages ?? []).slice(0, 20).map((o) => {
              const ongoing = !o.ended_at;
              return (
                <li key={o.id} className="flex items-center gap-3 rounded-md border border-border/40 bg-card/30 px-3 py-2 text-xs">
                  <WifiOff className={`h-4 w-4 shrink-0 ${ongoing ? "text-destructive" : "text-muted-foreground"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {ongoing ? (
                        <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">offline agora</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">recuperado</Badge>
                      )}
                      <span className="font-medium">{formatDuration(o.duration_seconds ?? Math.max(0, Math.round((Date.now() - new Date(o.started_at).getTime()) / 1000)))}</span>
                      <span className="text-muted-foreground">sem heartbeat</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Início: {new Date(o.started_at).toLocaleString()}
                      {o.ended_at ? ` · Fim: ${new Date(o.ended_at).toLocaleString()}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="border-border/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Utilização média diária</h3>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Últimos {periodLabel}</span>
        </div>
        <div className="h-56">
          {daily.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem amostras suficientes para os últimos {periodLabel}.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="h-cpu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.5} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="h-ram" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient>
                  <linearGradient id="h-disk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Area type="monotone" dataKey="cpu"  stroke="#10b981" fill="url(#h-cpu)"  strokeWidth={1.5} name="CPU" />
                <Area type="monotone" dataKey="ram"  stroke="#0ea5e9" fill="url(#h-ram)"  strokeWidth={1.5} name="RAM" />
                <Area type="monotone" dataKey="disk" stroke="#f59e0b" fill="url(#h-disk)" strokeWidth={1.5} name="Disco" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="border-border/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" /> Mudanças detectadas
          </h3>
          <div className="flex flex-wrap gap-1">
            <FilterPill active={cat === "all"} onClick={() => setCat("all")} label="Tudo" count={(changes ?? []).length} />
            <FilterPill active={cat === "hardware"} onClick={() => setCat("hardware")} label="Hardware" count={counts.hardware} />
            <FilterPill active={cat === "network"}  onClick={() => setCat("network")}  label="Rede"     count={counts.network} />
            <FilterPill active={cat === "software"} onClick={() => setCat("software")} label="Software" count={counts.software} />
            <FilterPill active={cat === "os"}       onClick={() => setCat("os")}       label="SO"       count={counts.os} />
          </div>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Carregando…</p>
        ) : (changes ?? []).length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Nenhuma mudança registrada nos últimos {periodLabel}. As mudanças aparecem aqui assim que o agente reportar diferenças.
          </p>
        ) : (
          <ul className="space-y-2">
            {(changes ?? []).map((c) => {
              const meta = CAT_LABEL[c.category] ?? CAT_LABEL.hardware;
              const Icon = meta.icon;
              const fieldLabel = FIELD_LABEL[c.field] ?? c.field;
              return (
                <li key={c.id} className="flex items-start gap-3 rounded-md border border-border/40 bg-card/30 px-3 py-2 text-xs">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] uppercase ${meta.tone}`}>{meta.label}</Badge>
                      <span className="font-medium">{fieldLabel}</span>
                      <ChangeBadge type={c.change_type} />
                    </div>
                    <ValueDiff old={c.old_value} next={c.new_value} type={c.change_type} />
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function FilterPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <Button
      type="button" size="sm" variant={active ? "default" : "outline"}
      onClick={onClick}
      className="h-7 gap-1.5 px-2.5 text-[11px]"
    >
      {label}
      <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>{count}</span>
    </Button>
  );
}

function ChangeBadge({ type }: { type: string }) {
  if (type === "added")   return <Badge variant="outline" className="gap-1 border-emerald-500/40 text-[10px] text-emerald-500"><Plus className="h-3 w-3" />adicionado</Badge>;
  if (type === "removed") return <Badge variant="outline" className="gap-1 border-destructive/40 text-[10px] text-destructive"><Minus className="h-3 w-3" />removido</Badge>;
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">alterado</Badge>;
}

function ValueDiff({ old, next, type }: { old: string | null; next: string | null; type: string }) {
  const show = (v: string | null) => v && v.length > 120 ? v.slice(0, 117) + "…" : v ?? "—";
  if (type === "added")   return <p className="mt-1 truncate font-mono text-[11px] text-emerald-500">{show(next)}</p>;
  if (type === "removed") return <p className="mt-1 truncate font-mono text-[11px] text-destructive line-through">{show(old)}</p>;
  return (
    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
      <span className="truncate line-through">{show(old)}</span>
      <ArrowRight className="h-3 w-3 shrink-0" />
      <span className="truncate text-foreground">{show(next)}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-card/30 px-2 py-2">
      <p className={`text-base font-semibold ${tone}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}