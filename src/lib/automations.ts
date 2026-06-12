import { FileCode2, Terminal, FileText, Clock, MousePointerClick, BellRing, type LucideIcon } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type Automation = Database["public"]["Tables"]["automations"]["Row"];
export type AutomationRun = Database["public"]["Tables"]["automation_runs"]["Row"];
export type AutomationKind = Database["public"]["Enums"]["automation_kind"];
export type AutomationLanguage = Database["public"]["Enums"]["automation_language"];
export type AutomationTrigger = Database["public"]["Enums"]["automation_trigger"];
export type AutomationScope = Database["public"]["Enums"]["automation_scope"];
export type AutomationRunStatus = Database["public"]["Enums"]["automation_run_status"];

export const AUTOMATION_KINDS: AutomationKind[] = ["script", "task"];
export const AUTOMATION_LANGUAGES: AutomationLanguage[] = ["powershell", "bash", "python"];
export const AUTOMATION_TRIGGERS: AutomationTrigger[] = ["manual", "schedule", "alert"];
export const AUTOMATION_SCOPES: AutomationScope[] = ["all", "client", "endpoint"];

export const LANGUAGE_ICON: Record<AutomationLanguage, LucideIcon> = {
  powershell: Terminal,
  bash: Terminal,
  python: FileCode2,
};

export const TRIGGER_ICON: Record<AutomationTrigger, LucideIcon> = {
  manual: MousePointerClick,
  schedule: Clock,
  alert: BellRing,
};

export const KIND_ICON: Record<AutomationKind, LucideIcon> = {
  script: Terminal,
  task: FileText,
};

export const RUN_STATUS_TONE: Record<AutomationRunStatus, string> = {
  queued: "bg-muted text-muted-foreground border-border",
  running: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  success: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export const TRIGGER_TONE: Record<AutomationTrigger, string> = {
  manual: "bg-muted text-foreground border-border",
  schedule: "bg-primary/15 text-primary border-primary/30",
  alert: "bg-amber-500/15 text-amber-500 border-amber-500/30",
};

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function relTime(iso: string | null): string {
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