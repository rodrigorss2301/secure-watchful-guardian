import { Cpu, MemoryStick, HardDrive, WifiOff, Info, AlertTriangle, AlertOctagon, type LucideIcon } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type AlertRule = Database["public"]["Tables"]["alert_rules"]["Row"];
export type Alert = Database["public"]["Tables"]["alerts"]["Row"];
export type AlertSeverity = Database["public"]["Enums"]["alert_severity"];
export type AlertMetric = Database["public"]["Enums"]["alert_metric"];
export type AlertComparator = Database["public"]["Enums"]["alert_comparator"];
export type AlertStatus = Database["public"]["Enums"]["alert_status"];
export type AlertScope = Database["public"]["Enums"]["alert_scope"];

export const ALERT_SEVERITIES: AlertSeverity[] = ["info", "warning", "critical"];
export const ALERT_METRICS: AlertMetric[] = ["cpu", "ram", "disk", "offline"];
export const ALERT_COMPARATORS: AlertComparator[] = ["gt", "gte", "lt", "lte"];
export const ALERT_STATUSES: AlertStatus[] = ["open", "acknowledged", "resolved"];
export const ALERT_SCOPES: AlertScope[] = ["all", "client", "endpoint"];

export const SEVERITY_TONE: Record<AlertSeverity, string> = {
  info: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  warning: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

export const SEVERITY_ICON: Record<AlertSeverity, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

export const STATUS_TONE: Record<AlertStatus, string> = {
  open: "bg-destructive/15 text-destructive border-destructive/30",
  acknowledged: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  resolved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
};

export const METRIC_ICON: Record<AlertMetric, LucideIcon> = {
  cpu: Cpu,
  ram: MemoryStick,
  disk: HardDrive,
  offline: WifiOff,
};

export const COMPARATOR_SYMBOL: Record<AlertComparator, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

export function formatValue(metric: AlertMetric, value: number | null): string {
  if (value == null) return "—";
  if (metric === "offline") return `${Math.round(value)}m`;
  return `${Math.round(value)}%`;
}

export function relTime(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}