import { Monitor, Server, Smartphone, Network, type LucideIcon } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type Endpoint = Database["public"]["Tables"]["endpoints"]["Row"];
export type EndpointStatus = Database["public"]["Enums"]["endpoint_status"];
export type EndpointType = Database["public"]["Enums"]["endpoint_type"];

export const ENDPOINT_STATUSES: EndpointStatus[] = ["online", "warning", "critical", "offline"];
export const ENDPOINT_TYPES: EndpointType[] = ["workstation", "server", "mobile", "network"];

export const STATUS_TONE: Record<EndpointStatus, string> = {
  online: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  offline: "bg-muted text-muted-foreground border-border",
};

export const STATUS_DOT: Record<EndpointStatus, string> = {
  online: "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60",
  warning: "bg-amber-500 shadow-[0_0_8px] shadow-amber-500/60",
  critical: "bg-destructive shadow-[0_0_8px] shadow-destructive/60",
  offline: "bg-muted-foreground/50",
};

export const TYPE_ICON: Record<EndpointType, LucideIcon> = {
  workstation: Monitor,
  server: Server,
  mobile: Smartphone,
  network: Network,
};

export function timeAgo(iso: string | null, neverLabel: string) {
  if (!iso) return neverLabel;
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function usageTone(pct: number | null | undefined): string {
  if (pct == null) return "bg-muted";
  if (pct >= 90) return "bg-destructive";
  if (pct >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}