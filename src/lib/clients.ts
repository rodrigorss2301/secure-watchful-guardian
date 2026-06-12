import type { Database } from "@/integrations/supabase/types";

export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
export type ClientContact = Database["public"]["Tables"]["client_contacts"]["Row"];
export type ClientStatus = Database["public"]["Enums"]["client_status"];
export type SlaTier = Database["public"]["Enums"]["sla_tier"];

export const CLIENT_STATUSES: ClientStatus[] = ["active", "inactive", "prospect"];
export const SLA_TIERS: SlaTier[] = ["bronze", "silver", "gold", "platinum"];

export const STATUS_TONE: Record<ClientStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  inactive: "bg-muted text-muted-foreground border-border",
  prospect: "bg-amber-500/15 text-amber-500 border-amber-500/30",
};

export const SLA_TONE: Record<SlaTier, string> = {
  bronze: "bg-amber-700/15 text-amber-700 border-amber-700/30 dark:text-amber-400",
  silver: "bg-slate-400/15 text-slate-400 border-slate-400/30",
  gold: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  platinum: "bg-primary/15 text-primary border-primary/30",
};