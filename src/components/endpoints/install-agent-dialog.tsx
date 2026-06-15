import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Download, Loader2, RefreshCw, Terminal, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preselectedClientId?: string | null;
  mode?: "install" | "update";
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function InstallAgentDialog({ open, onOpenChange, preselectedClientId, mode = "install" }: Props) {
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

  const createInternal = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("no tenant");
      const existing = clients?.find((c) => c.name.toLowerCase() === "interno");
      if (existing) return existing;
      const { data, error } = await supabase
        .from("clients")
        .insert({ tenant_id: tenant.id, name: "Interno", status: "active" })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["clients-lite"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      setClientId(c.id);
      toast.success(`Cliente "${c.name}" pronto`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!open) { setToken(null); setExpiresAt(null); setClientId(""); }
    else if (preselectedClientId) { setClientId(preselectedClientId); }
  }, [open, preselectedClientId]);

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
    ? `powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:RMM_URL='${baseUrl}'; $env:RMM_TOKEN='${token}'; iex (iwr -useb ($env:RMM_URL + '/agent/install.ps1')).Content"`
    : "";

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado`); }
    catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            {mode === "update" ? "Reinstalar / atualizar agente" : "Instalar agente Windows"}
          </DialogTitle>
          <DialogDescription>
            {mode === "update"
              ? "Gere um novo token e execute o comando no endpoint como Administrador para reinstalar e atualizar o agente para a versão mais recente. O dispositivo continuará vinculado ao mesmo cliente."
              : "Gere um token de inscrição, copie o comando e execute no endpoint como Administrador. O agente envia heartbeat (CPU, RAM, disco) a cada 1 minuto."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Cliente</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => createInternal.mutate()}
                disabled={createInternal.isPending}
              >
                {createInternal.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Building2 className="h-3 w-3" />}
                Usar cliente "Interno"
              </Button>
            </div>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setToken(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Para instalar nos seus próprios servidores/estações, use o cliente "Interno".
            </p>
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
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-zinc-950 p-3 pr-20 text-xs leading-relaxed text-zinc-100">
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