const DEFAULT_AGENT_URL = "https://secure-watchful-guardian.lovable.app";

export function resolveAgentBaseUrl(configured?: string): string {
  const url = new URL(configured?.trim() || DEFAULT_AGENT_URL);
  if (url.protocol !== "https:" || url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Configure VITE_AGENT_BASE_URL com a origem HTTPS pública do RMM, sem caminho ou credenciais.");
  }
  return url.origin;
}

export function buildAgentInstallScript(baseUrl: string, token: string): string {
  const origin = resolveAgentBaseUrl(baseUrl);
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Token de inscrição inválido.");
  return `$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion -lt [version]'5.1') { throw 'Use Windows PowerShell 5.1 ou superior.' }
$admin = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Abra o PowerShell como Administrador e tente novamente.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$baseUrl = '${origin}'
$token = '${token}'
$path = Join-Path ([IO.Path]::GetTempPath()) ('autotechs-rmm-' + [guid]::NewGuid().ToString('N') + '.ps1')
try {
  Write-Host '[Autotechs] Baixando o agente por HTTPS...' -ForegroundColor Cyan
  Invoke-WebRequest -Uri ($baseUrl + '/agent/install.ps1') -OutFile $path -UseBasicParsing -TimeoutSec 60 -MaximumRedirection 0
  $script = [IO.File]::ReadAllText($path)
  if ($script -notmatch 'Autotechs RMM - Agente Windows' -or $script.TrimStart() -match '^<(?:!doctype|html)') { throw 'O servidor nao retornou um instalador valido.' }
  Unblock-File -LiteralPath $path
  & $path -BaseUrl $baseUrl -EnrollToken $token
  Write-Host '[Autotechs] Instalacao concluida. Confira a conexao no painel.' -ForegroundColor Green
} catch {
  Write-Host 'Instalacao interrompida. Confira a conexao HTTPS, o certificado do servidor e a validade do token.' -ForegroundColor Red
  throw
} finally {
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
}`;
}

export function buildAgentInstallCommand(baseUrl: string, token: string): string {
  const script = buildAgentInstallScript(baseUrl, token);
  // Windows PowerShell's EncodedCommand takes UTF-16LE.
  let bytes = "";
  for (let i = 0; i < script.length; i++) {
    const code = script.charCodeAt(i);
    bytes += String.fromCharCode(code & 255, code >> 8);
  }
  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${btoa(bytes)}`;
}
