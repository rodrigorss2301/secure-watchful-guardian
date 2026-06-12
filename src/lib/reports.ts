import { supabase } from "@/integrations/supabase/client";

export type ReportRange = "7d" | "30d" | "90d" | "all";

export function rangeToSince(range: ReportRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export type ReportRow = Record<string, string | number | null>;

export function toCSV(rows: ReportRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  return lines.join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function diffHours(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 36e5) * 10) / 10;
}

export async function fetchTicketsReport(since: string | null): Promise<ReportRow[]> {
  let q = supabase
    .from("tickets")
    .select("number,title,status,priority,category,created_at,resolved_at,closed_at,sla_due_at,clients(name)")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (since) q = q.gte("created_at", since);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    number: t.number,
    title: t.title,
    client: t.clients?.name ?? "",
    status: t.status,
    priority: t.priority,
    category: t.category ?? "",
    created_at: t.created_at,
    resolved_at: t.resolved_at,
    closed_at: t.closed_at,
  }));
}

export async function fetchSLAReport(since: string | null): Promise<ReportRow[]> {
  let q = supabase
    .from("tickets")
    .select("number,title,priority,created_at,started_at,resolved_at,sla_due_at,status,clients(name)")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (since) q = q.gte("created_at", since);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((t: any) => {
    const breached = t.sla_due_at && t.resolved_at
      ? new Date(t.resolved_at) > new Date(t.sla_due_at)
      : t.sla_due_at && !t.resolved_at
        ? new Date() > new Date(t.sla_due_at)
        : false;
    return {
      number: t.number,
      client: t.clients?.name ?? "",
      priority: t.priority,
      status: t.status,
      response_hours: diffHours(t.created_at, t.started_at),
      resolution_hours: diffHours(t.created_at, t.resolved_at),
      sla_due_at: t.sla_due_at,
      sla_breached: breached ? "yes" : "no",
    };
  });
}

export async function fetchInventoryReport(): Promise<ReportRow[]> {
  const { data, error } = await supabase
    .from("endpoints")
    .select("hostname,type,status,os,os_version,ip_address,agent_version,cpu_usage,ram_usage,disk_usage,last_heartbeat,clients(name)")
    .order("hostname")
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    hostname: e.hostname,
    client: e.clients?.name ?? "",
    type: e.type,
    status: e.status,
    os: e.os ?? "",
    os_version: e.os_version ?? "",
    ip_address: e.ip_address ?? "",
    agent_version: e.agent_version ?? "",
    cpu_usage: e.cpu_usage,
    ram_usage: e.ram_usage,
    disk_usage: e.disk_usage,
    last_heartbeat: e.last_heartbeat,
  }));
}

export async function fetchAlertsReport(since: string | null): Promise<ReportRow[]> {
  let q = supabase
    .from("alerts")
    .select("metric,severity,status,message,value,threshold,created_at,resolved_at,endpoints(hostname),clients(name)")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (since) q = q.gte("created_at", since);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((a: any) => ({
    created_at: a.created_at,
    severity: a.severity,
    status: a.status,
    metric: a.metric,
    value: a.value,
    threshold: a.threshold,
    message: a.message ?? "",
    endpoint: a.endpoints?.hostname ?? "",
    client: a.clients?.name ?? "",
    resolved_at: a.resolved_at,
  }));
}