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
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Endpoint } from "@/lib/endpoints";

type CommandType = Database["public"]["Enums"]["endpoint_command_type"];
type CommandRow = Database["public"]["Tables"]["endpoint_commands"]["Row"];

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  endpoint: Endpoint;
};

const ACTIONS: { key: CommandType; label: string; desc: string; icon: typeof Power; tone: string }[] = [
  { key: "shutdown",    label: "Desligar",       desc: "shutdown /s /t {delay}",  icon: Power,   tone: "text-destructive" },
  { key: "restart",     label: "Reiniciar",      desc: "shutdown /r /t {delay}",  icon: RotateCw,tone: "text-amber-500" },
  { key: "sleep",       label: "Suspender",      desc: "rundll32 powrprof.dll,SetSuspendState 0,1,0", icon: Moon, tone: "text-sky-500" },
  { key: "hibernate",   label: "Hibernar",       desc: "shutdown /h",             icon: Moon,    tone: "text-sky-500" },
  { key: "wake_on_lan", label: "Ligar (WoL)",    desc: "Pacote mágico para o MAC do endpoint", icon: Wifi, tone: "text-emerald-500" },
  { key: "logoff",      label: "Encerrar sessão",desc: "shutdown /l",             icon: LogOut,  tone: "text-muted-foreground" },
];

export function PowerDialog({ open, onOpenChange, endpoint }: Props) {
  const qc = useQueryClient();
  const [delay, setDelay] = useState(30);
  const [message, setMessage] = useState("Manutenção remota agendada pelo seu suporte.");

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
      const params: Record<string, unknown> =
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
      toast.success(`Comando "${command}" enviado para ${endpoint.hostname}`);
      qc.invalidateQueries({ queryKey: ["endpoint-commands", endpoint.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Power className="h-5 w-5 text-primary" /> Controle de energia
          </DialogTitle>
          <DialogDescription>
            Envia um comando para o agente em <span className="font-mono">{endpoint.hostname}</span>.
            O agente executa na próxima sincronização.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Atraso (segundos)</Label>
            <Input
              type="number" min={0} max={3600}
              value={delay}
              onChange={(e) => setDelay(Math.max(0, Math.min(3600, Number(e.target.value) || 0)))}
            />
            <p className="text-xs text-muted-foreground">Usado em desligar / reiniciar.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem ao usuário</Label>
            <Input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={120} />
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
                disabled={disabled || (offline && needsOnline)}
                onClick={() => enqueue.mutate(a.key)}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3 text-left transition hover:border-primary/50 hover:bg-card disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${a.tone}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{a.label}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{a.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {endpoint.status === "offline" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Endpoint offline. Apenas <strong>Wake-on-LAN</strong> é entregue agora; os demais comandos aguardam o próximo heartbeat.
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Últimos comandos</h3>
          {!history?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum comando enviado ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border border-border/40 bg-card/30 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    {c.status === "pending" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    <span className="font-mono">{c.command}</span>
                    <span className="text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <Badge variant="outline" className={statusTone(c.status)}>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function statusTone(s: CommandRow["status"]) {
  switch (s) {
    case "succeeded": return "border-emerald-500/30 text-emerald-500";
    case "failed":    return "border-destructive/30 text-destructive";
    case "cancelled": return "border-border text-muted-foreground";
    case "sent":      return "border-sky-500/30 text-sky-500";
    default:          return "border-amber-500/30 text-amber-500";
  }
}