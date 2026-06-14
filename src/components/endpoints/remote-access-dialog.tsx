import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, MonitorPlay, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Endpoint } from "@/lib/endpoints";

type CommandRow = Database["public"]["Tables"]["endpoint_commands"]["Row"];

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  endpoint: Endpoint & { [k: string]: unknown };
};

function buildRdpFile(host: string, username: string, port: number) {
  const fullAddress = port && port !== 3389 ? `${host}:${port}` : host;
  return [
    `full address:s:${fullAddress}`,
    `username:s:${username}`,
    "prompt for credentials:i:1",
    "administrative session:i:0",
    "screen mode id:i:2",
    "use multimon:i:0",
    "desktopwidth:i:1920",
    "desktopheight:i:1080",
    "session bpp:i:32",
    "audiomode:i:0",
    "redirectclipboard:i:1",
    "redirectprinters:i:0",
    "redirectdrives:i:0",
    "autoreconnection enabled:i:1",
    "authentication level:i:2",
    "negotiate security layer:i:1",
    "enablecredsspsupport:i:1",
    "compression:i:1",
    "bandwidthautodetect:i:1",
    "",
  ].join("\r\n");
}

export function RemoteAccessDialog({ open, onOpenChange, endpoint }: Props) {
  const qc = useQueryClient();
  const publicIp = (endpoint.public_ip as string | null) ?? null;
  const privateIp = endpoint.ip_address ?? null;
  const loggedUser = (endpoint.logged_user as string | null) ?? null;
  const domain = (endpoint.domain as string | null) ?? null;

  const [target, setTarget] = useState<"private" | "public" | "custom">(
    privateIp ? "private" : publicIp ? "public" : "custom",
  );
  const [customHost, setCustomHost] = useState(endpoint.hostname ?? "");
  const [port, setPort] = useState<number>(3389);

  const defaultUser = useMemo(() => {
    if (loggedUser) return loggedUser;
    if (domain && domain !== "WORKGROUP") return `${domain}\\Administrator`;
    return "Administrator";
  }, [loggedUser, domain]);
  const [username, setUsername] = useState(defaultUser);

  const host = target === "private" ? privateIp ?? "" : target === "public" ? publicIp ?? "" : customHost.trim();
  const ready = host.length > 0 && username.length > 0 && port > 0;

  const download = () => {
    if (!ready) { toast.error("Preencha o host e o usuário"); return; }
    const content = buildRdpFile(host, username, port);
    const blob = new Blob([content], { type: "application/x-rdp;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${endpoint.hostname || "endpoint"}.rdp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Arquivo .rdp gerado — abra-o no Windows");
  };

  const mstsc = `mstsc /v:${host}${port !== 3389 ? `:${port}` : ""}`;
  const copyMstsc = async () => {
    try { await navigator.clipboard.writeText(mstsc); toast.success("Comando copiado"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  const { data: history } = useQuery({
    queryKey: ["endpoint-commands", endpoint.id, "remote-access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoint_commands")
        .select("*")
        .eq("endpoint_id", endpoint.id)
        .eq("command", "enable_rdp")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data as CommandRow[];
    },
    enabled: open,
    refetchInterval: open ? 5_000 : false,
  });

  const enableRdp = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("endpoint_commands").insert({
        tenant_id: endpoint.tenant_id,
        endpoint_id: endpoint.id,
        command: "enable_rdp",
        params: { port },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preparação de RDP enviada para o agente");
      qc.invalidateQueries({ queryKey: ["endpoint-commands", endpoint.id] });
      qc.invalidateQueries({ queryKey: ["endpoint-commands", endpoint.id, "remote-access"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5" /> Área de Trabalho Remota
          </DialogTitle>
          <DialogDescription>
            Gere um arquivo <code className="font-mono">.rdp</code> pronto para conectar a{" "}
            <span className="font-medium text-foreground">{endpoint.hostname}</span> via RDP nativo do Windows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Endereço de destino</Label>
            <RadioGroup value={target} onValueChange={(v) => setTarget(v as typeof target)} className="space-y-1.5">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <RadioGroupItem value="private" disabled={!privateIp} />
                  <span>IP privado</span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">{privateIp ?? "indisponível"}</span>
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <RadioGroupItem value="public" disabled={!publicIp} />
                  <span>IP público</span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">{publicIp ?? "indisponível"}</span>
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <RadioGroupItem value="custom" />
                  <span>Host / IP personalizado</span>
                </span>
                <Input
                  value={customHost}
                  onChange={(e) => setCustomHost(e.target.value)}
                  onFocus={() => setTarget("custom")}
                  placeholder="ex: vpn.empresa.local"
                  className="h-7 w-48 text-xs"
                />
              </label>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Usuário</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="DOMÍNIO\usuário" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Porta</Label>
              <Input
                type="number" min={1} max={65535}
                value={port} onChange={(e) => setPort(Number(e.target.value) || 3389)}
              />
            </div>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-400">
            <div className="flex gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Pré-requisitos no endpoint</p>
                <ul className="list-disc space-y-0.5 pl-4 opacity-90">
                  <li>RDP habilitado (Sistema → Área de Trabalho Remota).</li>
                  <li>Porta {port} liberada no firewall do Windows e na rede.</li>
                  <li>Para IP público, configure port-forwarding ou VPN — exposição direta na internet não é recomendada.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Preparar endpoint para RDP</p>
                <p className="text-xs text-muted-foreground">Ativa Área de Trabalho Remota, serviço TermService e regras do firewall do Windows.</p>
              </div>
              <Button variant="outline" onClick={() => enableRdp.mutate()} disabled={enableRdp.isPending || endpoint.status === "offline"}>
                Preparar RDP
              </Button>
            </div>
            {history?.[0] && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">Último: {history[0].output ?? new Date(history[0].created_at).toLocaleString()}</span>
                <Badge variant="outline" className={statusTone(history[0].status)}>{history[0].status}</Badge>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Comando mstsc</Label>
            <div className="flex gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">{mstsc}</code>
              <Button variant="outline" size="icon" onClick={copyMstsc} disabled={!ready}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={download} disabled={!ready} className="w-full shadow-glow">
            <Download className="mr-2 h-4 w-4" /> Baixar arquivo .rdp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}