# Autotechs RMM - Agente Windows
# Uso (como Administrador):
#   powershell -ExecutionPolicy Bypass -File install.ps1 -BaseUrl "<BaseUrl>" -EnrollToken "<TOKEN>"

$BaseUrl = $null
$EnrollToken = $null
$Mode = "Install"

for ($i = 0; $i -lt $args.Count; $i++) {
  switch -Regex ($args[$i]) {
    '^-BaseUrl$'     { if ($i + 1 -lt $args.Count) { $BaseUrl = "$($args[++$i])" }; continue }
    '^-EnrollToken$' { if ($i + 1 -lt $args.Count) { $EnrollToken = "$($args[++$i])" }; continue }
    '^-Mode$'        { if ($i + 1 -lt $args.Count) { $Mode = "$($args[++$i])" }; continue }
  }
}
if ($Mode -ne "Install" -and $Mode -ne "Heartbeat") { $Mode = "Install" }
$ErrorActionPreference = "Stop"
if (-not $BaseUrl     -and $env:RMM_URL)   { $BaseUrl     = $env:RMM_URL }
if (-not $EnrollToken -and $env:RMM_TOKEN) { $EnrollToken = $env:RMM_TOKEN }

$AgentVersion = "1.7.0"
$InstallDir   = "C:\ProgramData\AutotechsRMM"
$QueueDir     = Join-Path $InstallDir "queue"
$ConfigPath   = Join-Path $InstallDir "config.json"
$StatePath    = Join-Path $InstallDir "state.json"
$AgentPath    = Join-Path $InstallDir "agent.ps1"
$LogPath      = Join-Path $InstallDir "agent.log"
$ErrorPath    = Join-Path $InstallDir "last_error.txt"
$TaskName     = "AutotechsRMMAgent"
$TailscaleExeCandidates = @(
  "C:\Program Files\Tailscale\tailscale.exe",
  "C:\Program Files (x86)\Tailscale\tailscale.exe"
)
$Script:LastError = $null

function Write-Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  try { Add-Content -Path $LogPath -Value $line -ErrorAction SilentlyContinue } catch {}
  Write-Host $line
}
function Set-Error($msg) {
  $Script:LastError = "$msg"
  try { Set-Content -Path $ErrorPath -Value $msg -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
}
function Get-State {
  if (Test-Path $StatePath) {
    try { return Get-Content $StatePath -Raw | ConvertFrom-Json } catch { return @{} }
  }
  return @{}
}
function Save-State($state) {
  try { ($state | ConvertTo-Json -Depth 6) | Set-Content -Path $StatePath -Encoding UTF8 } catch {}
}
function Get-TailscaleExePath {
  foreach ($p in $TailscaleExeCandidates) { if (Test-Path $p) { return $p } }
  return $TailscaleExeCandidates[0]
}

# C:\ProgramData herda "Usuarios: leitura + criar arquivos". Sem isto qualquer
# usuario local lia o config.json (agent_token e chave HMAC do tenant) e podia
# pre-criar agent.ps1.new para o auto-update executar codigo dele como SYSTEM.
# SIDs em vez de nomes para funcionar em Windows de qualquer idioma.
function Protect-InstallDir {
  try {
    & icacls.exe "$InstallDir" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" /T /C 2>&1 | Out-Null
    Write-Log "Permissoes do diretorio restritas a SYSTEM/Administradores."
  } catch {
    Write-Log ("Nao foi possivel restringir permissoes de {0}: {1}" -f $InstallDir, $_.Exception.Message)
  }
}

# ==================== HMAC helper para assinar comandos ====================
function Compute-Hmac($message, $keyHex) {
  try {
    $keyBytes = New-Object byte[] ($keyHex.Length / 2)
    for ($i = 0; $i -lt $keyBytes.Length; $i++) {
      $keyBytes[$i] = [Convert]::ToByte($keyHex.Substring($i * 2, 2), 16)
    }
    $h = New-Object System.Security.Cryptography.HMACSHA256
    $h.Key = $keyBytes
    $bytes = [Text.Encoding]::UTF8.GetBytes($message)
    $hash = $h.ComputeHash($bytes)
    return -join ($hash | ForEach-Object { $_.ToString("x2") })
  } catch { return $null }
}

# O servidor manda em signed_payload o texto exato que assinou. Antes o agente
# tentava remontar esse texto com ConvertTo-Json -Compress, mas o banco assina
# jsonb::text ('{"port": 3389}', com espacos), entao a assinatura nunca batia
# quando o comando tinha parametros.
function Verify-Command($cmd, $keyHex) {
  if (-not $keyHex) { return $false }
  if (-not $cmd.signature -or -not $cmd.signed_payload) { return $false }
  $expected = Compute-Hmac "$($cmd.signed_payload)" $keyHex
  if (-not $expected) { return $false }
  $sig = "$($cmd.signature)"
  if ($expected.Length -ne $sig.Length) { return $false }
  $diff = 0
  for ($i = 0; $i -lt $expected.Length; $i++) {
    $diff = $diff -bor ([int][char]$expected[$i] -bxor [int][char]$sig[$i])
  }
  if ($diff -ne 0) { return $false }
  # O payload tem que descrever ESTE comando, senao a assinatura valida de um
  # comando antigo poderia ser reaproveitada para outro.
  return "$($cmd.signed_payload)".StartsWith("$($cmd.id)|$($cmd.command)|")
}

# Parametros e timeout saem do payload assinado, nunca dos campos soltos do
# JSON (que nao sao cobertos pela assinatura).
function Get-SignedParts($cmd) {
  $payload = "$($cmd.signed_payload)"
  $prefix  = "$($cmd.id)|$($cmd.command)|"
  if (-not $payload.StartsWith($prefix)) { return $null }
  $rest = $payload.Substring($prefix.Length)
  $cut  = $rest.LastIndexOf('|')
  if ($cut -lt 1) { return $null }
  $timeout = 0
  if (-not [int]::TryParse($rest.Substring($cut + 1), [ref]$timeout)) { return $null }
  return @{ ParamsJson = $rest.Substring(0, $cut); TimeoutSeconds = $timeout }
}

# ==================== Metricas / Sistema / Inventario ====================
function Get-Metrics {
  $cpu = $null; $ram = $null; $disk = $null; $rtt = $null
  try { $c = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average; if ($c.Average -ne $null) { $cpu = [double]$c.Average } } catch {}
  try { $os = Get-CimInstance Win32_OperatingSystem; if ($os.TotalVisibleMemorySize -gt 0) { $used = $os.TotalVisibleMemorySize - $os.FreePhysicalMemory; $ram = [math]::Round(($used / $os.TotalVisibleMemorySize) * 100, 1) } } catch {}
  try { $d = Get-PSDrive -Name C -ErrorAction Stop; $total = $d.Used + $d.Free; if ($total -gt 0) { $disk = [math]::Round(($d.Used / $total) * 100, 1) } } catch {}
  try {
    $gw = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1).NextHop
    if ($gw) { $p = Test-Connection -ComputerName $gw -Count 2 -Quiet:$false -ErrorAction SilentlyContinue; if ($p) { $rtt = ($p | Measure-Object -Property ResponseTime -Average).Average } }
  } catch {}
  return @{ cpu = $cpu; ram = $ram; disk = $disk; rtt = $rtt }
}

function Get-SystemInfo {
  $os = Get-CimInstance Win32_OperatingSystem
  $ip = $null
  try {
    $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
      Where-Object { $_.NextHop -and $_.NextHop -ne "0.0.0.0" } |
      Sort-Object -Property RouteMetric, InterfaceMetric |
      Where-Object { (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).InterfaceDescription -notmatch "Tailscale" } |
      Select-Object -First 1
    if ($route) {
      $ip = (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1).IPAddress
    }
  } catch {}
  $mac = $null
  try { $mac = (Get-NetAdapter -Physical -ErrorAction Stop | Where-Object Status -eq "Up" | Select-Object -First 1).MacAddress } catch {}
  $tsIp = $null
  try {
    $tsIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -like "100.*" -and $_.InterfaceAlias -match "Tailscale" } | Select-Object -First 1).IPAddress
    $tsExe = Get-TailscaleExePath
    if (-not $tsIp -and (Test-Path $tsExe)) {
      $tsOut = & $tsExe ip -4 2>$null | Select-Object -First 1
      if ($tsOut -and $tsOut -match "^100\.") { $tsIp = "$tsOut".Trim() }
    }
  } catch {}
  return @{ hostname=$env:COMPUTERNAME; os=$os.Caption; os_version=$os.Version; ip_address=$ip; mac_address=$mac; tailscale_ip=$tsIp }
}

function Get-Inventory {
  $inv = @{}
  try { $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1; if ($cpu) { $inv.cpu_model=$cpu.Name; $inv.cpu_cores=[int]$cpu.NumberOfCores; $inv.cpu_threads=[int]$cpu.NumberOfLogicalProcessors } } catch {}
  try { $os = Get-CimInstance Win32_OperatingSystem; if ($os) { $inv.ram_total_mb=[int]([math]::Round($os.TotalVisibleMemorySize / 1024)); $inv.last_boot_at=($os.LastBootUpTime).ToString("o"); $inv.uptime_seconds=[int]((Get-Date) - $os.LastBootUpTime).TotalSeconds } } catch {}
  try { $gpu = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name -ErrorAction SilentlyContinue; if ($gpu) { $inv.gpu = ($gpu -join "; ") } } catch {}
  try { $cs = Get-CimInstance Win32_ComputerSystem; if ($cs) { $inv.manufacturer=$cs.Manufacturer; $inv.model=$cs.Model; $inv.domain=$cs.Domain; $inv.logged_user=$cs.UserName } } catch {}
  try { $bb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1; if ($bb) { $inv.motherboard = ("{0} {1}" -f $bb.Manufacturer, $bb.Product).Trim() } } catch {}
  try { $bios = Get-CimInstance Win32_BIOS | Select-Object -First 1; if ($bios) { $inv.bios_vendor=$bios.Manufacturer; $inv.bios_version=$bios.SMBIOSBIOSVersion; if ($bios.ReleaseDate) { try { $inv.bios_date=([Management.ManagementDateTimeConverter]::ToDateTime($bios.ReleaseDate)).ToString("yyyy-MM-dd") } catch {} }; $inv.serial_number=$bios.SerialNumber } } catch {}
  try { $inv.timezone = (Get-TimeZone).Id } catch {}
  try { $gw = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop | Sort-Object RouteMetric | Select-Object -First 1).NextHop; if ($gw) { $inv.gateway = $gw } } catch {}
  try { $dns = Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.ServerAddresses } | Select-Object -ExpandProperty ServerAddresses -Unique; if ($dns) { $inv.dns_servers = @($dns) } } catch {}
  try { $pub = Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 8; if ($pub.ip) { $inv.public_ip = $pub.ip } } catch {}
  try {
    $nics = @()
    foreach ($a in (Get-NetAdapter -ErrorAction Stop)) {
      $ipv4 = (Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
      $nics += @{ name=$a.Name; mac=$a.MacAddress; ip=$ipv4; speed_mbps=if ($a.LinkSpeed) { [int]([double]($a.LinkSpeed -replace '[^\d\.]','') ) } else { $null }; status="$($a.Status)" }
    }
    $inv.network_interfaces = $nics
  } catch {}
  try {
    $disks = @()
    foreach ($v in (Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction Stop)) {
      $sizeGb = [math]::Round($v.Size / 1GB, 2); $freeGb = [math]::Round($v.FreeSpace / 1GB, 2)
      $usedPct = if ($v.Size -gt 0) { [int][math]::Round((($v.Size - $v.FreeSpace) / $v.Size) * 100) } else { $null }
      $disks += @{ name=$v.DeviceID; mount=$v.DeviceID; fs=$v.FileSystem; type="Fixed"; size_gb=$sizeGb; free_gb=$freeGb; used_pct=$usedPct }
    }
    $inv.disks = $disks
  } catch {}
  try {
    $paths = @("HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*","HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")
    $soft = @()
    foreach ($p in $paths) {
      try { $soft += Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { @{ name="$($_.DisplayName)"; version="$($_.DisplayVersion)"; publisher="$($_.Publisher)"; install_date="$($_.InstallDate)" } } } catch {}
    }
    $inv.installed_software = @($soft | Sort-Object { $_.name } -Unique | Select-Object -First 500)
  } catch {}
  try { $procs = Get-Process -ErrorAction SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object -First 30 | ForEach-Object { @{ name=$_.ProcessName; pid=[int]$_.Id; ram_mb=[int]([math]::Round($_.WorkingSet64 / 1MB)); cpu=if ($_.CPU) { [math]::Round($_.CPU, 1) } else { $null } } }; $inv.running_processes = @($procs) } catch {}
  try { $svcs = Get-Service -ErrorAction SilentlyContinue | ForEach-Object { @{ name=$_.Name; display_name=$_.DisplayName; status="$($_.Status)"; start_type="$($_.StartType)" } }; $inv.services = @($svcs | Select-Object -First 300) } catch {}
  try {
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $result = $searcher.Search("IsInstalled=0 and Type='Software'")
    $ups = @()
    foreach ($u in $result.Updates) {
      $kb = $null; if ($u.KBArticleIDs.Count -gt 0) { $kb = "KB$($u.KBArticleIDs.Item(0))" }
      $ups += @{ id="$($u.Identity.UpdateID)"; title="$($u.Title)"; severity="$($u.MsrcSeverity)"; kb=$kb }
    }
    $inv.pending_updates = $ups
  } catch {}
  return $inv
}

# ==================== Eventos do Event Viewer ====================
function Get-CriticalEvents($state) {
  $events = @()
  try {
    $startTime = if ($state.last_event_ts) { [DateTime]::Parse($state.last_event_ts) } else { (Get-Date).AddMinutes(-5) }
    $filter = @{ LogName=@('System','Application'); Level=@(1,2); StartTime=$startTime }
    $raw = Get-WinEvent -FilterHashtable $filter -MaxEvents 50 -ErrorAction SilentlyContinue
    if ($raw) {
      foreach ($e in $raw) {
        $level = switch ($e.Level) { 1 { "critical" } 2 { "error" } default { "info" } }
        $msg = if ($e.Message) { $e.Message.Substring(0, [Math]::Min(3000, $e.Message.Length)) } else { "(sem mensagem)" }
        $events += @{
          source = "windows"; level = $level; event_id = [int]$e.Id
          provider = "$($e.ProviderName)"; message = $msg
          occurred_at = $e.TimeCreated.ToUniversalTime().ToString("o")
        }
      }
      $state.last_event_ts = (Get-Date).ToUniversalTime().ToString("o")
    }
  } catch { Write-Log ("Eventos: {0}" -f $_.Exception.Message) }
  return @{ events = $events; state = $state }
}

# ==================== Comandos remotos ====================
function Invoke-AgentCommand($cmd, $params) {
  $delay = 0; $message = ""
  if ($params) {
    if ($params.PSObject.Properties.Name -contains "delay_seconds") { $delay = [int]$params.delay_seconds }
    if ($params.PSObject.Properties.Name -contains "message") { $message = "$($params.message)" }
  }
  $msgArg = ""; if ($message) { $msgArg = " /c `"$message`"" }
  switch ($cmd) {
    "enable_rdp"  { $rdpPort = 3389; if ($params -and ($params.PSObject.Properties.Name -contains "port")) { $rdpPort = [int]$params.port }; return (Enable-RdpAccess -Port $rdpPort) }
    "shutdown"    { Start-Process -FilePath "shutdown.exe" -ArgumentList ("/s /t {0}{1}" -f $delay, $msgArg) -WindowStyle Hidden -Wait; return "shutdown /s /t $delay scheduled" }
    "restart"     { Start-Process -FilePath "shutdown.exe" -ArgumentList ("/r /t {0}{1}" -f $delay, $msgArg) -WindowStyle Hidden -Wait; return "shutdown /r /t $delay scheduled" }
    "logoff"      { Start-Process -FilePath "shutdown.exe" -ArgumentList "/l" -WindowStyle Hidden -Wait; return "logoff issued" }
    "hibernate"   { Start-Process -FilePath "shutdown.exe" -ArgumentList "/h" -WindowStyle Hidden -Wait; return "hibernate issued" }
    "sleep"       { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false) | Out-Null; return "sleep issued" }
    "wake_on_lan" { return "wake_on_lan must be triggered from another host on the same LAN" }
    default       { throw "unknown command: $cmd" }
  }
}

function Send-CommandLog($cfg, $commandId, $lines) {
  if (-not $lines -or $lines.Count -eq 0) { return }
  $body = @{ agent_token = $cfg.agent_token; command_id = $commandId; lines = $lines } | ConvertTo-Json -Compress -Depth 4
  try { Invoke-RestMethod -Method Post -Uri ("{0}/api/public/agent/command-log" -f $cfg.base_url) -ContentType "application/json" -Body $body -TimeoutSec 20 | Out-Null } catch {}
}

function Report-CommandResult($cfg, $commandId, $status, $output, $failedReason) {
  $body = @{ agent_token=$cfg.agent_token; command_id=$commandId; status=$status; output=$output; failed_reason=$failedReason } | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Method Post -Uri ("{0}/api/public/agent/command-result" -f $cfg.base_url) -ContentType "application/json" -Body $body -TimeoutSec 30 | Out-Null
  } catch {
    Write-Log ("Falha ao reportar resultado {0}: {1}" -f $commandId, $_.Exception.Message)
  }
}

function Process-Commands($cfg, $commands) {
  if (-not $commands -or $commands.Count -eq 0) { return }
  foreach ($c in $commands) {
    # Fail-closed: antes, agente sem chave de assinatura executava qualquer
    # comando sem verificar nada.
    if (-not (Verify-Command $c $cfg.command_signing_key)) {
      Write-Log ("Comando {0} rejeitado: assinatura invalida" -f $c.id)
      Report-CommandResult $cfg $c.id "failed" "Assinatura HMAC invalida" "invalid_signature"
      continue
    }
    $signed = Get-SignedParts $c
    if (-not $signed) {
      Write-Log ("Comando {0} rejeitado: payload assinado malformado" -f $c.id)
      Report-CommandResult $cfg $c.id "failed" "Payload assinado malformado" "invalid_signature"
      continue
    }
    if ($c.expires_at -and ([DateTime]::Parse($c.expires_at).ToUniversalTime() -lt (Get-Date).ToUniversalTime())) {
      Write-Log ("Comando {0} expirado, ignorando" -f $c.id)
      continue
    }

    $timeout = $signed.TimeoutSeconds
    if ($timeout -le 0) { $timeout = 300 }
    Send-CommandLog $cfg $c.id @(@{ level="info"; message="Iniciando execucao (timeout ${timeout}s)" })

    $status = "succeeded"; $output = ""; $failedReason = $null
    try {
      # O job recebe as funcoes reais, entao executa o mesmo conjunto de
      # comandos do modo sincrono. Antes o switch dentro do job so conhecia
      # shutdown/restart/logoff e lancava para o resto.
      $fnRdp = (Get-Command Enable-RdpAccess).Definition
      $fnInv = (Get-Command Invoke-AgentCommand).Definition
      $job = Start-Job -ScriptBlock {
        param($fnRdp, $fnInv, $command, $paramsJson)
        Set-Item -Path function:Enable-RdpAccess    -Value ([ScriptBlock]::Create($fnRdp))
        Set-Item -Path function:Invoke-AgentCommand -Value ([ScriptBlock]::Create($fnInv))
        $p = $null
        if ($paramsJson) { try { $p = $paramsJson | ConvertFrom-Json } catch { $p = $null } }
        Invoke-AgentCommand $command $p
      } -ArgumentList $fnRdp, $fnInv, "$($c.command)", $signed.ParamsJson

      if (Wait-Job -Job $job -Timeout $timeout) {
        $jobError = $null
        $output = (Receive-Job -Job $job -ErrorVariable jobError -ErrorAction SilentlyContinue | Out-String).Trim()
        # O erro do job era engolido e o agente reportava "succeeded" sem ter
        # executado nada (enable_rdp, hibernate e sleep caiam nisso).
        if ($job.State -ne "Completed" -or ($jobError -and $jobError.Count -gt 0)) {
          $reason = if ($jobError -and $jobError.Count -gt 0) {
            "$($jobError[0])"
          } elseif ($job.ChildJobs -and $job.ChildJobs[0].JobStateInfo.Reason) {
            "$($job.ChildJobs[0].JobStateInfo.Reason.Message)"
          } else {
            "job terminou em estado $($job.State)"
          }
          $status = "failed"; $failedReason = "exec_error"; $output = $reason
          Send-CommandLog $cfg $c.id @(@{ level="error"; message=$reason })
        } else {
          Send-CommandLog $cfg $c.id @(@{ level="info"; message=("Concluido em " + [int]((Get-Date) - $job.PSBeginTime).TotalSeconds + "s") })
        }
      } else {
        Stop-Job -Job $job -ErrorAction SilentlyContinue
        $status = "timeout"; $failedReason = "timeout_after_${timeout}s"; $output = "Comando excedeu o tempo limite"
        Send-CommandLog $cfg $c.id @(@{ level="error"; message="Timeout atingido, job interrompido" })
      }
      Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    } catch {
      $status = "failed"; $failedReason = "exec_error"; $output = "$($_.Exception.Message)"
      Send-CommandLog $cfg $c.id @(@{ level="error"; message=$output })
    }
    Report-CommandResult $cfg $c.id $status $output $failedReason
  }
}

# ==================== Auto-update ====================
function Apply-AutoUpdate($cfg, $latest) {
  if (-not $latest -or -not $latest.version) { return }
  if ($latest.version -eq $AgentVersion) { return }
  # Comparacao simples de versao (semver-ish)
  $cur = $AgentVersion -split '\.'; $new = "$($latest.version)" -split '\.'
  $shouldUpdate = $false
  for ($i = 0; $i -lt [Math]::Max($cur.Length, $new.Length); $i++) {
    $a = if ($i -lt $cur.Length) { [int]$cur[$i] } else { 0 }
    $b = if ($i -lt $new.Length) { [int]$new[$i] } else { 0 }
    if ($b -gt $a) { $shouldUpdate = $true; break }
    if ($b -lt $a) { break }
  }
  if (-not $shouldUpdate) { return }

  # Sem hash nao ha atualizacao: o script baixado roda como SYSTEM.
  if (-not $latest.sha256) {
    Set-Error "Auto-update ignorado: release sem SHA-256"
    Write-Log "Auto-update: release sem SHA-256 - ignorando"
    return
  }
  # Apenas HTTPS absoluto ou caminho no proprio servidor (http:// era aceito).
  $url = if ("$($latest.script_url)" -match "^https://") {
    "$($latest.script_url)"
  } elseif ("$($latest.script_url)" -match "^/[^/]") {
    "$($cfg.base_url)$($latest.script_url)"
  } else {
    $null
  }
  if (-not $url) {
    Set-Error ("Auto-update ignorado: script_url invalido ({0})" -f $latest.script_url)
    Write-Log ("Auto-update: script_url invalido ({0}) - ignorando" -f $latest.script_url)
    return
  }

  try {
    Write-Log ("Auto-update: baixando {0} ({1})" -f $latest.version, $url)
    $tmp = "$AgentPath.new"
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 120
    $h = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLower()
    if ($h -ne "$($latest.sha256)".ToLower()) {
      Remove-Item $tmp -ErrorAction SilentlyContinue
      Set-Error "Auto-update abortado: SHA-256 nao confere"
      Write-Log "Auto-update: SHA-256 nao confere - descartando"
      return
    }
    Move-Item -Path $tmp -Destination $AgentPath -Force
    Write-Log ("Auto-update aplicado para {0} - proxima execucao usa nova versao" -f $latest.version)
    # Marca timestamp
    $cfg | Add-Member -NotePropertyName agent_last_update_at -NotePropertyValue (Get-Date).ToUniversalTime().ToString("o") -Force
    ($cfg | ConvertTo-Json -Depth 6) | Set-Content -Path $ConfigPath -Encoding UTF8
  } catch {
    Set-Error ("Auto-update falhou: {0}" -f $_.Exception.Message)
    Write-Log ("Auto-update falhou: {0}" -f $_.Exception.Message)
  }
}

# ==================== Fila offline ====================
function Enqueue-Payload($payload) {
  try {
    if (-not (Test-Path $QueueDir)) { New-Item -ItemType Directory -Path $QueueDir -Force | Out-Null }
    $f = Join-Path $QueueDir ("hb_" + (Get-Date -Format "yyyyMMddHHmmssfff") + ".json")
    $payload | Set-Content -Path $f -Encoding UTF8
    # Limita a 500 arquivos
    $files = Get-ChildItem $QueueDir -Filter "hb_*.json" | Sort-Object LastWriteTime
    if ($files.Count -gt 500) { $files | Select-Object -First ($files.Count - 500) | Remove-Item -Force -ErrorAction SilentlyContinue }
  } catch {}
}
function Get-QueueSize {
  if (-not (Test-Path $QueueDir)) { return 0 }
  return (Get-ChildItem $QueueDir -Filter "hb_*.json" -ErrorAction SilentlyContinue).Count
}
function Drain-Queue($cfg) {
  if (-not (Test-Path $QueueDir)) { return }
  $files = Get-ChildItem $QueueDir -Filter "hb_*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -First 20
  foreach ($f in $files) {
    try {
      $json = Get-Content $f.FullName -Raw
      Invoke-RestMethod -Method Post -Uri ("{0}/api/public/agent/heartbeat" -f $cfg.base_url) -ContentType "application/json" -Body $json -TimeoutSec 30 | Out-Null
      Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue
    } catch { Write-Log ("Drain queue parou em {0}: {1}" -f $f.Name, $_.Exception.Message); break }
  }
}

# ==================== RDP / Tailscale (mantidos) ====================
function Enable-RdpAccess { param([int]$Port = 3389)
  if ($Port -lt 1 -or $Port -gt 65535) { $Port = 3389 }
  $messages = @()
  try {
    Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server" -Name "fDenyTSConnections" -Value 0 -ErrorAction Stop
    Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" -Name "UserAuthentication" -Value 1 -ErrorAction SilentlyContinue
    Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" -Name "PortNumber" -Value $Port -Type DWord -ErrorAction SilentlyContinue
    $messages += "RDP habilitado"
  } catch { $messages += ("falha RDP: {0}" -f $_.Exception.Message) }
  try { Set-Service -Name "TermService" -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service -Name "TermService" -ErrorAction SilentlyContinue } catch {}
  try {
    Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue | Out-Null
    Remove-NetFirewallRule -DisplayName "Autotechs RMM - RDP TCP" -ErrorAction SilentlyContinue
    # Domain,Private apenas: com -Profile Any a porta ficava aberta tambem em
    # redes publicas (cafe, hotel, 4G).
    New-NetFirewallRule -DisplayName "Autotechs RMM - RDP TCP" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Domain,Private -ErrorAction SilentlyContinue | Out-Null
  } catch {}
  return ($messages -join "; ")
}
function Install-Tailscale($authKey, $hostname) {
  if (-not $authKey) { Write-Log "Tailscale: sem auth key - pulando."; return }
  try {
    $tsExe = Get-TailscaleExePath
    if (-not (Test-Path $tsExe)) {
      $arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "x86" }
      $msi = Join-Path $env:TEMP "tailscale-setup.msi"
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $url = "https://pkgs.tailscale.com/stable/tailscale-setup-1.98.4-$arch.msi"
      Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing -TimeoutSec 300
      Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$msi`" /qn /norestart" -Wait | Out-Null
      Remove-Item $msi -ErrorAction SilentlyContinue
      $tsExe = Get-TailscaleExePath
    }
    Set-Service -Name "Tailscale" -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name "Tailscale" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    if (Test-Path $tsExe) {
      $tsHost = ($hostname -replace "[^a-zA-Z0-9\-]", "-").ToLower()
      & $tsExe up --authkey="$authKey" --hostname="$tsHost" --accept-routes --reset --unattended 2>&1 | ForEach-Object { Write-Log ("tailscale: {0}" -f $_) }
    }
  } catch { Write-Log ("Tailscale falhou: {0}" -f $_.Exception.Message) }
}

# ==================== Heartbeat principal ====================
function Invoke-Heartbeat {
  if (-not (Test-Path $ConfigPath)) { Write-Log "Config nao encontrado: $ConfigPath"; return }
  # Auto-correcao: instalacoes feitas por versoes anteriores ficaram com o
  # diretorio legivel/gravavel por qualquer usuario local.
  Protect-InstallDir
  $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
  $state = Get-State

  # 1) drena fila offline antes do heartbeat novo
  Drain-Queue $cfg

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $m = Get-Metrics
  $sys = Get-SystemInfo
  $evRes = Get-CriticalEvents $state
  $events = $evRes.events
  $state = $evRes.state

  # Self-health do agente
  $selfCpu = $null; $selfRam = $null
  try { $p = Get-Process -Id $PID; $selfRam = [int]($p.WorkingSet64 / 1MB) } catch {}
  $queueSize = Get-QueueSize

  $body = @{
    agent_token = $cfg.agent_token
    cpu_usage = $m.cpu; ram_usage = $m.ram; disk_usage = $m.disk
    gateway_rtt_ms = $m.rtt
    ip_address = $sys.ip_address; agent_version = $AgentVersion
    os_version = $sys.os_version; tailscale_ip = $sys.tailscale_ip
    agent_cpu_pct = $selfCpu; agent_ram_mb = $selfRam
    agent_queue_size = $queueSize
    agent_last_error = $Script:LastError
  }
  if ($events.Count -gt 0) { $body.events = $events }
  try { $inv = Get-Inventory; foreach ($k in $inv.Keys) { $body[$k] = $inv[$k] } } catch { Write-Log ("Inventario: {0}" -f $_.Exception.Message) }

  $json = $body | ConvertTo-Json -Compress -Depth 6
  $resp = $null
  try {
    $resp = Invoke-RestMethod -Method Post -Uri ("{0}/api/public/agent/heartbeat" -f $cfg.base_url) -ContentType "application/json" -Body $json -TimeoutSec 60
    $sw.Stop()
    # Reporta latencia no proximo ciclo
    $state.last_heartbeat_ms = [int]$sw.ElapsedMilliseconds
    Write-Log ("Heartbeat OK cpu={0} ram={1} disk={2} rtt={3}ms evts={4} q={5} dur={6}ms" -f $m.cpu,$m.ram,$m.disk,$m.rtt,$events.Count,$queueSize,$sw.ElapsedMilliseconds)
    if ($Script:LastError) { $Script:LastError = $null; Remove-Item $ErrorPath -ErrorAction SilentlyContinue }
    if ($resp -and $resp.commands) { Process-Commands $cfg $resp.commands }
    if ($resp -and $resp.latest_agent) { Apply-AutoUpdate $cfg $resp.latest_agent }
  } catch {
    $sw.Stop()
    Set-Error ("Heartbeat falhou: {0}" -f $_.Exception.Message)
    Write-Log ("Heartbeat falhou: {0} - enfileirando" -f $_.Exception.Message)
    Enqueue-Payload $json
  }

  Save-State $state
}

function Uninstall-AutotechsAgent {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Agente removido."
}

# ==================== Bootstrap ====================
if ($Mode -eq "Heartbeat") {
  Invoke-Heartbeat
} else {
  if (-not $BaseUrl -or -not $EnrollToken) { throw "BaseUrl e EnrollToken sao obrigatorios." }
  if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute o PowerShell como Administrador."
  }
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  New-Item -ItemType Directory -Path $QueueDir -Force | Out-Null
  # Antes de gravar config.json com o agent_token e a chave de assinatura.
  Protect-InstallDir
  Write-Log "Iniciando instalacao do agente Autotechs RMM $AgentVersion..."
  try { Invoke-WebRequest -Uri ("{0}/agent/install.ps1" -f $BaseUrl.TrimEnd("/")) -OutFile $AgentPath -UseBasicParsing }
  catch { Copy-Item -Path $PSCommandPath -Destination $AgentPath -Force -ErrorAction SilentlyContinue }
  if (-not (Test-Path $AgentPath)) { throw "Falha ao gravar agente em $AgentPath" }
  $sys = Get-SystemInfo
  $payload = @{
    token=$EnrollToken; hostname=$sys.hostname; os=$sys.os; os_version=$sys.os_version
    ip_address=$sys.ip_address; mac_address=$sys.mac_address; agent_version=$AgentVersion; type="workstation"
  } | ConvertTo-Json -Compress
  Write-Log "Registrando endpoint..."
  $resp = Invoke-RestMethod -Method Post -Uri ("{0}/api/public/agent/enroll" -f $BaseUrl.TrimEnd("/")) -ContentType "application/json" -Body $payload -TimeoutSec 30
  if (-not $resp.agent_token) { throw "Resposta invalida" }
  $cfg = @{
    base_url=$BaseUrl.TrimEnd("/"); endpoint_id=$resp.endpoint_id; agent_token=$resp.agent_token
    installed_at=(Get-Date).ToString("o")
    command_signing_key=$resp.command_signing_key
    update_channel=$resp.update_channel
  }
  if (-not $resp.command_signing_key) {
    throw "Servidor nao devolveu chave de assinatura de comandos - instalacao abortada."
  }
  $cfg | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
  Protect-InstallDir
  Write-Log "Endpoint registrado: $($resp.endpoint_id) (canal: $($resp.update_channel))"
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`" -Mode Heartbeat" -f $AgentPath)
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Autotechs RMM Agent $AgentVersion" | Out-Null
  Write-Log "Scheduled Task criada (1 min)."
  # RDP nao e mais habilitado sozinho em toda instalacao: quem precisa dispara
  # o comando enable_rdp pelo painel, no endpoint especifico.
  if ($resp.tailscale_auth_key) { Install-Tailscale -authKey $resp.tailscale_auth_key -hostname $sys.hostname }
  Invoke-Heartbeat
  Write-Log "Instalacao concluida."
}
