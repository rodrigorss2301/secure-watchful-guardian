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
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preselectedClientId?: string | null;
  mode?: "install" | "update";
};

const AGENT_BASE_URL = "https://secure-watchful-guardian.lovable.app";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function InstallAgentDialog({ open, onOpenChange, preselectedClientId, mode = "install" }: Props) {
  const { t, lang } = useI18n();
  const { tenant, user } = useAuth();
  const qc = useQueryClient();
  const [clientId, setClientId] = useState<string>("");
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const baseUrl = AGENT_BASE_URL;

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
      toast.success(t("install.clientReady").replace("{name}", c.name));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!open) { setToken(null); setExpiresAt(null); setClientId(""); }
    else if (preselectedClientId) { setClientId(preselectedClientId); }
  }, [open, preselectedClientId]);

  const generate = useMutation({
    mutationFn: async () => {
      if (!tenant || !clientId) throw new Error(t("endpoints.form.selectClient"));
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
      toast.success(t("install.tokenGenerated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Build a base64 (UTF-16LE) encoded PowerShell command so the user can paste
  // a single line into PowerShell or cmd without any quoting/escaping issues.
  const installCmd = token
    ? (() => {
        const inner = `$ErrorActionPreference='Stop'; Write-Host '[Autotechs] Habilitando TLS 1.2 no registro...' -ForegroundColor Cyan; try{ foreach($v in @('SOFTWARE\\Microsoft\\.NETFramework\\v4.0.30319','SOFTWARE\\Wow6432Node\\Microsoft\\.NETFramework\\v4.0.30319')){ if(-not (Test-Path "HKLM:\\$v")){ New-Item -Path "HKLM:\\$v" -Force | Out-Null }; New-ItemProperty -Path "HKLM:\\$v" -Name 'SchUseStrongCrypto' -Value 1 -PropertyType DWord -Force | Out-Null; New-ItemProperty -Path "HKLM:\\$v" -Name 'SystemDefaultTlsVersions' -Value 1 -PropertyType DWord -Force | Out-Null }; foreach($rp in @('HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\SCHANNEL\\Protocols\\TLS 1.2\\Client','HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\SCHANNEL\\Protocols\\TLS 1.2\\Server')){ if(-not (Test-Path $rp)){ New-Item -Path $rp -Force | Out-Null }; New-ItemProperty -Path $rp -Name 'Enabled' -Value 1 -PropertyType DWord -Force | Out-Null; New-ItemProperty -Path $rp -Name 'DisabledByDefault' -Value 0 -PropertyType DWord -Force | Out-Null } }catch{ Write-Host ('[Autotechs] Aviso: nao foi possivel ajustar registro TLS: ' + $_.Exception.Message) -ForegroundColor Yellow }; try{[Net.ServicePointManager]::SecurityProtocol=[Enum]::ToObject([Net.SecurityProtocolType],3072 -bor 12288)}catch{try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12}catch{}}; $u='${baseUrl}'; $t='${token}'; $env:RMM_URL=$u; $env:RMM_TOKEN=$t; $p=Join-Path $env:TEMP 'autotechs-rmm-install.ps1'; $url=$u + '/agent/install.ps1?v=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); $txt=$null; $lastErr=$null; $curl=Join-Path $env:SystemRoot 'System32\\curl.exe'; if(Test-Path $curl){ try{ & $curl -sSL --tlsv1.2 -o $p $url; if($LASTEXITCODE -eq 0 -and (Test-Path $p)){ $txt=[IO.File]::ReadAllText($p) } else { $lastErr='curl exit ' + $LASTEXITCODE } }catch{ $lastErr=$_.Exception.Message } }; if(-not $txt){ foreach($try in 1..3){ try{ $resp=Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{'Cache-Control'='no-cache'} -TimeoutSec 60; $txt=[Text.Encoding]::UTF8.GetString($resp.Content); break }catch{ $lastErr=$_.Exception.Message; Start-Sleep -Seconds 2 } } }; if(-not $txt){ try{ $bits=Join-Path $env:TEMP 'autotechs-rmm-install-bits.ps1'; Start-BitsTransfer -Source $url -Destination $bits -ErrorAction Stop; $txt=[IO.File]::ReadAllText($bits) }catch{ $lastErr=$lastErr + ' / BITS: ' + $_.Exception.Message } }; if(-not $txt){ try{ $wc=New-Object Net.WebClient; $wc.Headers.Add('Cache-Control','no-cache'); $b=$wc.DownloadData($url); $txt=[Text.Encoding]::UTF8.GetString($b) }catch{ $lastErr = $lastErr + ' / WC: ' + $_.Exception.Message } }; if(-not $txt){ Write-Host ''; Write-Host '===========================================================' -ForegroundColor Red; Write-Host ' TLS/SChannel deste Windows nao consegue negociar HTTPS.' -ForegroundColor Red; Write-Host ' O servidor exige TLS 1.2 com cipher suites modernos.' -ForegroundColor Red; Write-Host '===========================================================' -ForegroundColor Red; Write-Host ''; Write-Host 'Solucao (execute como Admin e REINICIE a maquina):' -ForegroundColor Yellow; Write-Host '  1) Este script ja habilitou TLS 1.2 no registro.'; Write-Host '  2) REINICIE o Windows para o SChannel recarregar as chaves.'; Write-Host '  3) Se persistir, instale o Update KB3140245 (Win 7/8/2008/2012) e reinicie.'; Write-Host '  4) Rode novamente este comando de instalacao.'; Write-Host ''; throw ('Falha ao baixar o instalador: ' + $lastErr) }; if($txt.TrimStart().StartsWith('<!DOCTYPE') -or $txt.TrimStart().StartsWith('<html')){throw 'Download retornou HTML em vez do instalador. Gere um novo comando no painel atualizado.'}; if($txt -notmatch 'Autotechs RMM - Agente Windows'){throw 'Instalador baixado invalido.'}; [IO.File]::WriteAllText($p,$txt,[Text.UTF8Encoding]::new($false)); Unblock-File -Path $p -ErrorAction SilentlyContinue; $pwsh=$null; $c1='C:\\Program Files\\PowerShell\\7\\pwsh.exe'; if(Test-Path $c1){$pwsh=$c1} else {$g=Get-Command pwsh.exe -ErrorAction SilentlyContinue; if($g){$pwsh=$g.Source}}; if(-not $pwsh){ Write-Host '[Autotechs] PowerShell 7 nao encontrado. Instalando...' -ForegroundColor Yellow; $wg=Get-Command winget.exe -ErrorAction SilentlyContinue; if($wg){ Start-Process -FilePath $wg.Source -ArgumentList 'install --id Microsoft.PowerShell -e --silent --accept-source-agreements --accept-package-agreements' -Wait -NoNewWindow } else { $msi=Join-Path $env:TEMP 'PowerShell-7-x64.msi'; if(Test-Path $curl){ & $curl -sSL --tlsv1.2 -o $msi 'https://github.com/PowerShell/PowerShell/releases/latest/download/PowerShell-7-win-x64.msi' } else { (New-Object Net.WebClient).DownloadFile('https://github.com/PowerShell/PowerShell/releases/latest/download/PowerShell-7-win-x64.msi',$msi) }; Start-Process msiexec.exe -ArgumentList @('/i',$msi,'/qn','/norestart','ADD_PATH=1') -Wait }; if(Test-Path $c1){$pwsh=$c1} else { $g=Get-Command pwsh.exe -ErrorAction SilentlyContinue; if($g){$pwsh=$g.Source} }; if(-not $pwsh){throw 'Falha ao instalar o PowerShell 7. Instale manualmente e tente novamente.'}; Write-Host '[Autotechs] PowerShell 7 instalado.' -ForegroundColor Green }; & $pwsh -NoProfile -ExecutionPolicy Bypass -File $p -BaseUrl $u -EnrollToken $t`;
        // UTF-16LE encode
        const bytes = new Uint8Array(inner.length * 2);
        for (let i = 0; i < inner.length; i++) {
          const code = inner.charCodeAt(i);
          bytes[i * 2] = code & 0xff;
          bytes[i * 2 + 1] = (code >> 8) & 0xff;
        }
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);
        return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`;
      })()
    : "";

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} ${t("install.copiedSuffix")}`); }
    catch { toast.error(t("install.copyFailed")); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal aria-hidden className="h-5 w-5" />
            {t(mode === "update" ? "install.titleUpdate" : "install.titleInstall")}
          </DialogTitle>
          <DialogDescription>
            {t(mode === "update" ? "install.descUpdate" : "install.descInstall")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <Label htmlFor="agent-client" className="text-xs font-medium text-muted-foreground">{t("endpoints.field.client")}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => createInternal.mutate()}
                disabled={createInternal.isPending}
              >
                {createInternal.isPending
                  ? <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
                  : <Building2 aria-hidden className="h-3 w-3" />}
                {t("install.useInternal")}
              </Button>
            </div>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setToken(null); }}>
              <SelectTrigger id="agent-client"><SelectValue placeholder={t("install.selectClient")} /></SelectTrigger>
              <SelectContent>
                {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {t("install.internalHelp")}
            </p>
          </div>

          {!token ? (
            <Button
              onClick={() => generate.mutate()}
              disabled={!clientId || generate.isPending}
              className="w-full shadow-glow"
            >
              {generate.isPending ? <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden className="mr-2 h-4 w-4" />}
              {t("install.generate")}
            </Button>
          ) : (
            <>
              <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-500">
                <div className="flex items-center gap-2 font-medium"><CheckCircle2 aria-hidden className="h-4 w-4" /> {t("install.tokenGenerated")}</div>
                <p className="mt-1 opacity-80">
                  {t("install.validUntil")} {expiresAt && formatDateTime(expiresAt, lang)} — {t("install.singleUse")}.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="agent-token" className="text-xs font-medium text-muted-foreground">{t("install.token")}</Label>
                  <Badge variant="outline" className="text-[10px]">{t("install.single")}</Badge>
                </div>
                <div className="flex gap-2">
                  <code id="agent-token" className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">{token}</code>
                  <Button variant="outline" size="icon" aria-label={t("install.copyToken")} title={t("install.copyToken")} onClick={() => copy(token, t("install.token"))}><Copy aria-hidden className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label id="agent-cmd-label" className="text-xs font-medium text-muted-foreground">
                  {t("install.commandLabel")}
                </Label>
                <div className="relative">
                  <pre aria-labelledby="agent-cmd-label" tabIndex={0} className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-zinc-950 p-3 pr-20 text-xs leading-relaxed text-zinc-100">
{installCmd}
                  </pre>
                  <Button
                    variant="secondary" size="sm"
                    className="absolute right-2 top-2"
                    onClick={() => copy(installCmd, t("install.command"))}
                  >
                    <Copy aria-hidden className="mr-1.5 h-3 w-3" /> {t("common.copy")}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("install.commandHelp")}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" asChild className="flex-1">
                  <a href={`${AGENT_BASE_URL}/agent/install.ps1`} download>
                    <Download aria-hidden className="mr-2 h-4 w-4" /> {t("install.download")}
                  </a>
                </Button>
                <Button variant="ghost" onClick={() => { setToken(null); setExpiresAt(null); }}>
                  {t("install.generateAnother")}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}