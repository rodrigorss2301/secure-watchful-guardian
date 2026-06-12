import {
  AlertCircle, Bug, FileQuestion, GitBranch, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type Ticket = Database["public"]["Tables"]["tickets"]["Row"];
export type TicketComment = Database["public"]["Tables"]["ticket_comments"]["Row"];
export type TicketActivity = Database["public"]["Tables"]["ticket_activity"]["Row"];
export type TicketStatus = Database["public"]["Enums"]["ticket_status"];
export type TicketPriority = Database["public"]["Enums"]["ticket_priority"];
export type TicketCategory = Database["public"]["Enums"]["ticket_category"];

export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed"];
export const TICKET_PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
export const TICKET_CATEGORIES: TicketCategory[] = ["incident", "request", "problem", "change", "question"];

export const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  in_progress: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  waiting: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  resolved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

export const PRIORITY_TONE: Record<TicketPriority, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  high: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  urgent: "bg-destructive/15 text-destructive border-destructive/30",
};

export const CATEGORY_ICON: Record<TicketCategory, LucideIcon> = {
  incident: AlertCircle,
  request: Wrench,
  problem: Bug,
  change: GitBranch,
  question: FileQuestion,
};

export function slaState(ticket: Pick<Ticket, "sla_due_at" | "status">) {
  if (!ticket.sla_due_at || ticket.status === "resolved" || ticket.status === "closed") return "none" as const;
  const diff = new Date(ticket.sla_due_at).getTime() - Date.now();
  if (diff < 0) return "breached" as const;
  if (diff < 60 * 60 * 1000) return "imminent" as const;
  return "ok" as const;
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