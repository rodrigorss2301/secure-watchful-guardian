import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Power, RotateCw, Moon, Wifi, LogOut, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Endpoint } from "@/lib/endpoints";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

type CommandType = Database["public"]["Enums"]["endpoint_command_type"];
type CommandRow = Database["public"]["Tables"]["endpoint_commands"]["Row"];

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  endpoint: Endpoint;
};

const ACTIONS: { key: CommandType; labelKey: TKey; desc: string; descKey?: TKey; icon: typeof Power; tone: string }[] = [
  { key: "shutdown",    labelKey: "power.action.shutdown", desc: "shutdown /s /t {delay}",  icon: Power,   tone: "text-destructive" },
  { key: "restart",     labelKey: "power.action.restart", desc: "shutdown /r /t {delay}",  icon: RotateCw,tone: "text-amber-600 dark:text-amber-500" },
  { key: "sleep",       labelKey: "power.action.sleep", desc: "rundll32 powrprof.dll,SetSuspendState 0,1,0", icon: Moon, tone: "text-sky-600 dark:text-sky-500" },
  { key: "hibernate",   labelKey: "power.action.hibernate", desc: "shutdown /h",             icon: Moon,    tone: "text-sky-600 dark:text-sky-500" },
  { key: "wake_on_lan", labelKey: "power.action.wol", desc: "", descKey: "power.action.wolDesc", icon: Wifi, tone: "text-emerald-600 dark:text-emerald-500" },
  { key: "logoff",      labelKey: "power.action.logoff", desc: "shutdown /l",             icon: LogOut,  tone: "text-muted-foreground" },
];

export function PowerDialog({ open, onOpenChange, endpoint }: Props) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [delay, setDelay] = useState(30);
  const [message, setMessage] = useState("Manutenção remota agendada pelo seu suporte.");
  // Ação aguardando confirmação. Tudo que interrompe o usuário da máquina pede confirmação;
  // Wake-on-LAN só liga a máquina e é enviado direto.
  const [confirming, setConfirming] = useState<(typeof ACTIONS)[number] | null>(null);

  const { data: history } = useQuery({
    queryKey: ["endpoint-commands", endpoint.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoint_commands")
        .select("*")
        .eq("endpoint_id", endpoint.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as CommandRow[];
    },
    enabled: open,
    refetchInterval: open ? 5_000 : false,
  });

  const enqueue = useMutation({
    mutationFn: async (command: CommandType) => {
      const params =
        command === "shutdown" || command === "restart"
          ? { delay_seconds: delay, message }
          : {};
      const { error } = await supabase.from("endpoint_commands").insert({
        tenant_id: endpoint.tenant_id,
        endpoint_id: endpoint.id,
        command,
        params,
      });
      if (error) throw error;
    },
    onSuccess: (_d, command) => {
      toast.success(t("power.sent").replace("{command}", command).replace("{host}", endpoint.hostname));
      qc.invalidateQueries({ queryKey: ["endpoint-commands", endpoint.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Power aria-hidden className="h-5 w-5 text-primary" /> {t("power.title")}
          </DialogTitle>
          <DialogDescription>
            {t("power.descPrefix")} <span className="font-mono">{endpoint.hostname}</span>.{" "}
            {t("power.descSuffix")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pwr-delay">{t("power.delay")}</Label>
            <Input
              id="pwr-delay"
              type="number" min={0} max={3600}
              value={delay}
              onChange={(e) => setDelay(Math.max(0, Math.min(3600, Number(e.target.value) || 0)))}
            />
            <p className="text-xs text-muted-foreground">{t("power.delayHelp")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pwr-msg">{t("power.message")}</Label>
            <Input id="pwr-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={120} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            const disabled = enqueue.isPending;
            const offline = endpoint.status === "offline";
            const needsOnline = a.key !== "wake_on_lan";
            return (
              <button
                key={a.key}
                type="button"
                disabled={disabled || (offline && needsOnline)}
                onClick={() => (a.key === "wake_on_lan" ? enqueue.mutate(a.key) : setConfirming(a))}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3 text-left transition hover:border-primary/50 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 ${a.tone}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t(a.labelKey)}</div>
                  <div className="break-all font-mono text-[11px] text-muted-foreground">{a.descKey ? t(a.descKey) : a.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {endpoint.status === "offline" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
            <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {t("power.offlineNotice")}
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("power.recent")}</h3>
          {!history?.length ? (
            <p className="text-sm text-muted-foreground">{t("power.recentEmpty")}</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 bg-card/30 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.status === "pending" && <Loader2 aria-hidden className="h-3 w-3 animate-spin text-muted-foreground" />}
                    <span className="font-mono">{c.command}</span>
                    <span className="text-muted-foreground">{formatDateTime(c.created_at, lang)}</span>
                  </div>
                  <Badge variant="outline" className={statusTone(c.status)}>{cmdStatusLabel(c.status, t)}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming ? t(confirming.labelKey) : ""} {endpoint.hostname}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.key === "shutdown" || confirming?.key === "restart"
                ? t(confirming.key === "shutdown" ? "power.confirm.shutdown" : "power.confirm.restart").replace("{delay}", String(delay))
                : t("power.confirm.session")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={confirming?.key === "shutdown" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={() => {
                if (confirming) enqueue.mutate(confirming.key);
                setConfirming(null);
              }}
            >
              {confirming ? t(confirming.labelKey) : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function statusTone(s: CommandRow["status"]) {
  switch (s) {
    case "succeeded": return "border-emerald-500/30 text-emerald-600 dark:text-emerald-500";
    case "failed":    return "border-destructive/30 text-destructive";
    case "cancelled": return "border-border text-muted-foreground";
    case "sent":      return "border-sky-500/30 text-sky-600 dark:text-sky-500";
    default:          return "border-amber-500/30 text-amber-600 dark:text-amber-500";
  }
}
function cmdStatusLabel(status: string, t: (k: TKey) => string) {
  const known = ["pending", "sent", "succeeded", "failed", "cancelled", "timeout", "expired"];
  return known.includes(status) ? t(`commands.status.${status}` as TKey) : status;
}
