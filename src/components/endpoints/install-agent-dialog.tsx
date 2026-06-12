import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Download, Loader2, RefreshCw, Terminal, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Props = { open: boolean; onOpenChange: (o: boolean) => void };

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function InstallAgentDialog({ open, onOpenChange }: Props) {
  const { tenant, user } = useAuth();
  const qc = useQueryClient();
  const [clientId, setClientId] = useState<string>("");
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const { data: clients } = useQuery({
    queryKey: ["clients-lite", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant && open,
  });

  useEffect(() => {
    if (!open) { setToken(null); setExpiresAt(null); setClientId(""); }
  }, [open]);

  const generate = useMutation({
    mutationFn: async () => {
      if (!tenant || !clientId) throw new Error("Selecione um cliente");
      const newToken = generateToken();
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("agent_enrollments").insert({
        tenant_id: tenant.id,
        client_id: clientId,
        token: newToken,
        default_type: "workstation",
        expires_at: expires,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      return { newToken, expires };
    },
    onSuccess: ({ newToken, expires }) => {
      setToken(newToken);
      setExpiresAt(expires);
      qc.invalidateQueries({ queryKey: ["agent_enrollments"] });
      toast.success("Token gerado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const installCmd = token
    ? `iwr -useb "${baseUrl}/agent/install.ps1" -OutFile "$env:TEMP\\install.ps1"; & "$env:TEMP\\install.ps1" -BaseUrl "${baseUrl}" -EnrollToken "${token}"`
    : "";

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado`); }
    catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" /> Instalar agente Windows</DialogTitle>
          <DialogDescription>
            Gere um token de inscrição, copie o comando e execute no endpoint como Administrador.
            O agente envia heartbeat (CPU, RAM, disco) a cada 1 minuto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Cliente</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setToken(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!token ? (
            <Button
              onClick={() => generate.mutate()}
              disabled={!clientId || generate.isPending}
              className="w-full shadow-glow"
            >
              {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Gerar token de inscrição
            </Button>
          ) : (
            <>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600">
                <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" /> Token gerado</div>
                <p className="mt-1 opacity-80">
                  Válido até {expiresAt && new Date(expiresAt).toLocaleString()} — uso único.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Token</Label>
                  <Badge variant="outline" className="text-[10px]">único</Badge>
                </div>
                <div className="flex gap-2">
                  <code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">{token}</code>
                  <Button variant="outline" size="icon" onClick={() => copy(token, "Token")}><Copy className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Comando de instalação (PowerShell como Administrador)
                </Label>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-md border border-border bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100">
{installCmd}
                  </pre>
                  <Button
                    variant="secondary" size="sm"
                    className="absolute right-2 top-2"
                    onClick={() => copy(installCmd, "Comando")}
                  >
                    <Copy className="mr-1.5 h-3 w-3" /> Copiar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Cole no PowerShell elevado do endpoint. O script registra o dispositivo, cria uma Tarefa Agendada (SYSTEM, 1 min) e começa a enviar telemetria.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" asChild className="flex-1">
                  <a href="/agent/install.ps1" download>
                    <Download className="mr-2 h-4 w-4" /> Baixar install.ps1
                  </a>
                </Button>
                <Button variant="ghost" onClick={() => { setToken(null); setExpiresAt(null); }}>
                  Gerar outro
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}