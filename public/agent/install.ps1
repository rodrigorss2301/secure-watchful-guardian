# Autotechs RMM - Agente Windows
# Uso (como Administrador):
#   iwr -useb "<BaseUrl>/agent/install.ps1" | iex; Install-AutotechsAgent -BaseUrl "<BaseUrl>" -EnrollToken "<TOKEN>"
# Ou:
#   powershell -ExecutionPolicy Bypass -File install.ps1 -BaseUrl "<BaseUrl>" -EnrollToken "<TOKEN>"

[CmdletBinding()]
param(
  [string]$BaseUrl,
  [string]$EnrollToken,
  [ValidateSet("Install","Heartbeat")]
  [string]$Mode = "Install"
)

$ErrorActionPreference = "Stop"

# Fallback para variáveis de ambiente (permite invocação simples via `iex`)
if (-not $BaseUrl     -and $env:RMM_URL)   { $BaseUrl     = $env:RMM_URL }
if (-not $EnrollToken -and $env:RMM_TOKEN) { $EnrollToken = $env:RMM_TOKEN }

$AgentVersion = "1.4.3"
$InstallDir   = "C:\ProgramData\AutotechsRMM"
$ConfigPath   = Join-Path $InstallDir "config.json"
$AgentPath    = Join-Path $InstallDir "agent.ps1"
$LogPath      = Join-Path $InstallDir "agent.log"
$TaskName     = "AutotechsRMMAgent"
$TailscaleExeCandidates = @(
  "C:\Program Files\Tailscale\tailscale.exe",
  "C:\Program Files (x86)\Tailscale\tailscale.exe"
)

function Write-Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  try { Add-Content -Path $LogPath -Value $line -ErrorAction SilentlyContinue } catch {}
  Write-Host $line
}

function Get-TailscaleExePath {
  foreach ($p in $TailscaleExeCandidates) {
    if (Test-Path $p) { return $p }
  }
  return $TailscaleExeCandidates[0]
}

function Get-Metrics {
  $cpu = $null; $ram = $null; $disk = $null
  try {
    $c = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average
    if ($c.Average -ne $null) { $cpu = [double]$c.Average }
  } catch {}
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os.TotalVisibleMemorySize -gt 0) {
      $used = $os.TotalVisibleMemorySize - $os.FreePhysicalMemory
      $ram = [math]::Round(($used / $os.TotalVisibleMemorySize) * 100, 1)
    }
  } catch {}
  try {
    $d = Get-PSDrive -Name C -ErrorAction Stop
    $total = $d.Used + $d.Free
    if ($total -gt 0) { $disk = [math]::Round(($d.Used / $total) * 100, 1) }
  } catch {}
  return @{ cpu = $cpu; ram = $ram; disk = $disk }
}

function Get-SystemInfo {
  $os = Get-CimInstance Win32_OperatingSystem
  $ip = $null
  try {
    # Prefer the IPv4 of the interface used to reach the internet (default route).
    # This avoids picking Hyper-V / WSL / vEthernet virtual switches like 172.x.
    $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
      Where-Object { $_.NextHop -and $_.NextHop -ne "0.0.0.0" } |
      Sort-Object -Property RouteMetric, InterfaceMetric |
      Where-Object { (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).InterfaceDescription -notmatch "Tailscale" } |
      Select-Object -First 1
    if ($route) {
      $ip = (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1" } |
        Select-Object -First 1).IPAddress
    }
    if (-not $ip) {
      $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object {
          $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1" -and
          $_.PrefixOrigin -ne "WellKnown" -and
          $_.InterfaceAlias -notmatch "vEthernet|Hyper-V|WSL|VMware|VirtualBox|Loopback|Tailscale"
        } | Select-Object -First 1).IPAddress
    }
  } catch {}
  $mac = $null
  try {
    $mac = (Get-NetAdapter -Physical -ErrorAction Stop | Where-Object Status -eq "Up" | Select-Object -First 1).MacAddress
  } catch {}
  $tsIp = $null
  try {
    $tsIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -like "100.*" -and $_.InterfaceAlias -match "Tailscale" } |
      Select-Object -First 1).IPAddress
    $tsExe = Get-TailscaleExePath
    if (-not $tsIp -and (Test-Path $tsExe)) {
      $tsOut = & $tsExe ip -4 2>$null | Select-Object -First 1
      if ($tsOut -and $tsOut -match "^100\.") { $tsIp = "$tsOut".Trim() }
    }
  } catch {}
  return @{
    hostname   = $env:COMPUTERNAME
    os         = $os.Caption
    os_version = $os.Version
    ip_address = $ip
    mac_address = $mac
    tailscale_ip = $tsIp
  }
}

function Get-Inventory {
  $inv = @{}
  try {
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    if ($cpu) {
      $inv.cpu_model   = $cpu.Name
      $inv.cpu_cores   = [int]$cpu.NumberOfCores
      $inv.cpu_threads = [int]$cpu.NumberOfLogicalProcessors
    }
  } catch {}
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os) {
      $inv.ram_total_mb   = [int]([math]::Round($os.TotalVisibleMemorySize / 1024))
      $inv.last_boot_at   = ($os.LastBootUpTime).ToString("o")
      $inv.uptime_seconds = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds
    }
  } catch {}
  try {
    $gpu = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name -ErrorAction SilentlyContinue
    if ($gpu) { $inv.gpu = ($gpu -join "; ") }
  } catch {}
  try {
    $cs = Get-CimInstance Win32_ComputerSystem
    if ($cs) {
      $inv.manufacturer = $cs.Manufacturer
      $inv.model        = $cs.Model
      $inv.domain       = $cs.Domain
      $inv.logged_user  = $cs.UserName
    }
  } catch {}
  try {
    $bb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
    if ($bb) { $inv.motherboard = ("{0} {1}" -f $bb.Manufacturer, $bb.Product).Trim() }
  } catch {}
  try {
    $bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
    if ($bios) {
      $inv.bios_vendor  = $bios.Manufacturer
      $inv.bios_version = $bios.SMBIOSBIOSVersion
      if ($bios.ReleaseDate) {
        try { $inv.bios_date = ([Management.ManagementDateTimeConverter]::ToDateTime($bios.ReleaseDate)).ToString("yyyy-MM-dd") } catch {}
      }
      $inv.serial_number = $bios.SerialNumber
    }
  } catch {}
  try { $inv.timezone = (Get-TimeZone).Id } catch {}

  # Rede
  try {
    $gw = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop | Sort-Object RouteMetric | Select-Object -First 1).NextHop
    if ($gw) { $inv.gateway = $gw }
  } catch {}
  try {
    $dns = Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.ServerAddresses } | Select-Object -ExpandProperty ServerAddresses -Unique
    if ($dns) { $inv.dns_servers = @($dns) }
  } catch {}
  try {
    $pub = Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 8
    if ($pub.ip) { $inv.public_ip = $pub.ip }
  } catch {}
  try {
    $nics = @()
    foreach ($a in (Get-NetAdapter -ErrorAction Stop)) {
      $ipv4 = (Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
      $nics += @{
        name       = $a.Name
        mac        = $a.MacAddress
        ip         = $ipv4
        speed_mbps = if ($a.LinkSpeed) { [int]([double]($a.LinkSpeed -replace '[^\d\.]','') ) } else { $null }
        status     = "$($a.Status)"
      }
    }
    $inv.network_interfaces = $nics
  } catch {}

  # Discos
  try {
    $disks = @()
    foreach ($v in (Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction Stop)) {
      $sizeGb = [math]::Round($v.Size / 1GB, 2)
      $freeGb = [math]::Round($v.FreeSpace / 1GB, 2)
      $usedPct = if ($v.Size -gt 0) { [int][math]::Round((($v.Size - $v.FreeSpace) / $v.Size) * 100) } else { $null }
      $disks += @{
        name = $v.DeviceID; mount = $v.DeviceID; fs = $v.FileSystem
        type = "Fixed"; size_gb = $sizeGb; free_gb = $freeGb; used_pct = $usedPct
      }
    }
    $inv.disks = $disks
  } catch {}

  # Softwares instalados (registro)
  try {
    $paths = @(
      "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
      "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $soft = @()
    foreach ($p in $paths) {
      try {
        $soft += Get-ItemProperty $p -ErrorAction SilentlyContinue |
          Where-Object { $_.DisplayName } |
          ForEach-Object {
            @{
              name = "$($_.DisplayName)"
              version = "$($_.DisplayVersion)"
              publisher = "$($_.Publisher)"
              install_date = "$($_.InstallDate)"
            }
          }
      } catch {}
    }
    $inv.installed_software = @($soft | Sort-Object { $_.name } -Unique | Select-Object -First 500)
  } catch {}

  # Processos (top 30 por RAM)
  try {
    $procs = Get-Process -ErrorAction SilentlyContinue |
      Sort-Object WorkingSet64 -Descending | Select-Object -First 30 |
      ForEach-Object {
        @{
          name = $_.ProcessName
          pid  = [int]$_.Id
          ram_mb = [int]([math]::Round($_.WorkingSet64 / 1MB))
          cpu  = if ($_.CPU) { [math]::Round($_.CPU, 1) } else { $null }
        }
      }
    $inv.running_processes = @($procs)
  } catch {}

  # Serviços
  try {
    $svcs = Get-Service -ErrorAction SilentlyContinue | ForEach-Object {
      @{ name = $_.Name; display_name = $_.DisplayName; status = "$($_.Status)"; start_type = "$($_.StartType)" }
    }
    $inv.services = @($svcs | Select-Object -First 300)
  } catch {}

  # Atualizações pendentes (Windows Update)
  try {
    $session = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $result = $searcher.Search("IsInstalled=0 and Type='Software'")
    $ups = @()
    foreach ($u in $result.Updates) {
      $kb = $null
      if ($u.KBArticleIDs.Count -gt 0) { $kb = "KB$($u.KBArticleIDs.Item(0))" }
      $ups += @{ id = "$($u.Identity.UpdateID)"; title = "$($u.Title)"; severity = "$($u.MsrcSeverity)"; kb = $kb }
    }
    $inv.pending_updates = $ups
  } catch {}

  return $inv
}

function Invoke-AgentCommand($cmd, $params) {
  $delay = 0
  $message = ""
  if ($params) {
    if ($params.PSObject.Properties.Name -contains "delay_seconds") { $delay = [int]$params.delay_seconds }
    if ($params.PSObject.Properties.Name -contains "message") { $message = "$($params.message)" }
  }
  $msgArg = ""
  if ($message) { $msgArg = " /c `"$message`"" }

  switch ($cmd) {
    "enable_rdp"  {
      $rdpPort = 3389
      if ($params -and ($params.PSObject.Properties.Name -contains "port")) { $rdpPort = [int]$params.port }
      return (Enable-RdpAccess -Port $rdpPort)
    }
    "shutdown"    { Start-Process -FilePath "shutdown.exe" -ArgumentList ("/s /t {0}{1}" -f $delay, $msgArg) -WindowStyle Hidden -Wait; return "shutdown /s /t $delay scheduled" }
    "restart"     { Start-Process -FilePath "shutdown.exe" -ArgumentList ("/r /t {0}{1}" -f $delay, $msgArg) -WindowStyle Hidden -Wait; return "shutdown /r /t $delay scheduled" }
    "logoff"      { Start-Process -FilePath "shutdown.exe" -ArgumentList "/l" -WindowStyle Hidden -Wait; return "logoff issued" }
    "hibernate"   { Start-Process -FilePath "shutdown.exe" -ArgumentList "/h" -WindowStyle Hidden -Wait; return "hibernate issued" }
    "sleep"       { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false) | Out-Null; return "sleep issued" }
    "wake_on_lan" { return "wake_on_lan must be triggered from another host on the same LAN" }
    default       { throw "unknown command: $cmd" }
  }
}

function Enable-RdpAccess {
  [CmdletBinding()]
  param([int]$Port = 3389)

  if ($Port -lt 1 -or $Port -gt 65535) { $Port = 3389 }
  $messages = @()
  try {
    Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server" -Name "fDenyTSConnections" -Value 0 -ErrorAction Stop
    Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" -Name "UserAuthentication" -Value 1 -ErrorAction SilentlyContinue
    Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" -Name "PortNumber" -Value $Port -Type DWord -ErrorAction SilentlyContinue
    $messages += "RDP habilitado no Windows"
  } catch {
    $messages += ("falha ao habilitar RDP: {0}" -f $_.Exception.Message)
  }

  try {
    Set-Service -Name "TermService" -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name "TermService" -ErrorAction SilentlyContinue
    Restart-Service -Name "TermService" -Force -ErrorAction SilentlyContinue
    $messages += "TermService ativo"
  } catch {
    $messages += ("falha no TermService: {0}" -f $_.Exception.Message)
  }

  try {
    Enable-NetFirewallRule -Name "RemoteDesktop-UserMode-In-TCP","RemoteDesktop-UserMode-In-UDP" -ErrorAction SilentlyContinue | Out-Null
    Enable-NetFirewallRule -DisplayGroup "Área de Trabalho Remota" -ErrorAction SilentlyContinue | Out-Null
    Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue | Out-Null
    netsh advfirewall firewall set rule group="remote desktop" new enable=Yes | Out-Null
    netsh advfirewall firewall set rule group="área de trabalho remota" new enable=Yes | Out-Null
    Remove-NetFirewallRule -DisplayName "Autotechs RMM - RDP TCP" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "Autotechs RMM - RDP TCP" -Direction Inbound -Action Allow `
      -Protocol TCP -LocalPort $Port -Profile Any -ErrorAction SilentlyContinue | Out-Null
    Remove-NetFirewallRule -DisplayName "Autotechs RMM - RDP UDP" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "Autotechs RMM - RDP UDP" -Direction Inbound -Action Allow `
      -Protocol UDP -LocalPort $Port -Profile Any -ErrorAction SilentlyContinue | Out-Null
    $messages += ("firewall liberado para TCP {0}" -f $Port)
  } catch {
    $messages += ("falha no firewall: {0}" -f $_.Exception.Message)
  }

  # Tailscale: garantir que o adaptador virtual esteja classificado como rede Privada
  # (caso contrário, regras padrão de RDP só liberam em Private/Domain e o Windows
  # bloqueia o tráfego mesh do Tailscale, gerando o erro 0x204 no mstsc).
  try {
    $tsAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
      $_.InterfaceDescription -match "Tailscale" -or $_.Name -match "Tailscale"
    }
    foreach ($a in $tsAdapters) {
      try {
        Set-NetConnectionProfile -InterfaceAlias $a.Name -NetworkCategory Private -ErrorAction Stop
        $messages += ("perfil de rede '{0}' definido como Private" -f $a.Name)
      } catch {
        $messages += ("não foi possível alterar perfil de '{0}': {1}" -f $a.Name, $_.Exception.Message)
      }
    }
    if (-not $tsAdapters) {
      $messages += "adaptador Tailscale não encontrado (instale/conecte o Tailscale para acesso remoto via mesh)"
    }
  } catch {
    $messages += ("falha ao ajustar perfil de rede do Tailscale: {0}" -f $_.Exception.Message)
  }

  Start-Sleep -Seconds 2
  try {
    $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listening) {
      $messages += ("porta TCP {0} escutando" -f $Port)
    } else {
      $messages += ("atenção: porta TCP {0} ainda não está escutando; reinicie o Windows e tente novamente" -f $Port)
    }
  } catch {
    $messages += "não foi possível validar a porta RDP"
  }

  $result = ($messages -join "; ")
  Write-Log $result
  return $result
}

function Install-Tailscale($authKey, $hostname) {
  if (-not $authKey) { Write-Log "Tailscale: auth key não fornecida — pulando."; return }
  try {
    if (-not (Test-Path $TailscaleExe)) {
      Write-Log "Tailscale: baixando MSI..."
      $msi = Join-Path $env:TEMP "tailscale-setup.msi"
      Invoke-WebRequest -Uri "https://pkgs.tailscale.com/stable/tailscale-setup-latest.msi" `
        -OutFile $msi -UseBasicParsing -TimeoutSec 180
      Write-Log "Tailscale: instalando MSI silenciosamente..."
      $p = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
      if ($p.ExitCode -ne 0) { Write-Log ("Tailscale: msiexec retornou {0}" -f $p.ExitCode) }
      Remove-Item $msi -ErrorAction SilentlyContinue
    } else {
      Write-Log "Tailscale já instalado."
    }
    # Garante que o serviço esteja rodando
    Set-Service -Name "Tailscale" -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name "Tailscale" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    if (-not (Test-Path $TailscaleExe)) { Write-Log "Tailscale: executável não encontrado após instalação."; return }
    # Sobe (idempotente: re-rodar com a mesma key não cria duplicata)
    $tsHost = ($hostname -replace "[^a-zA-Z0-9\-]", "-").ToLower()
    Write-Log ("Tailscale: autenticando como '{0}'..." -f $tsHost)
    & $TailscaleExe up --authkey="$authKey" --hostname="$tsHost" --accept-routes --reset --unattended 2>&1 | ForEach-Object { Write-Log ("tailscale: {0}" -f $_) }
  } catch {
    Write-Log ("Tailscale falhou: {0}" -f $_.Exception.Message)
  }
}

function Process-Commands($cfg, $commands) {
  if (-not $commands -or $commands.Count -eq 0) { return }
  foreach ($c in $commands) {
    $status = "succeeded"; $output = ""
    try {
      $output = Invoke-AgentCommand $c.command $c.params
      Write-Log ("Comando {0} ({1}) executado" -f $c.command, $c.id)
    } catch {
      $status = "failed"; $output = "$($_.Exception.Message)"
      Write-Log ("Comando {0} ({1}) FALHOU: {2}" -f $c.command, $c.id, $output)
    }
    $body = @{
      agent_token = $cfg.agent_token
      command_id  = $c.id
      status      = $status
      output      = $output
    } | ConvertTo-Json -Compress
    try {
      Invoke-RestMethod -Method Post -Uri ("{0}/api/public/agent/command-result" -f $cfg.base_url) `
        -ContentType "application/json" -Body $body -TimeoutSec 30 | Out-Null
    } catch {
      Write-Log ("Falha ao reportar resultado {0}: {1}" -f $c.id, $_.Exception.Message)
    }
  }
}

function Invoke-Heartbeat {
  if (-not (Test-Path $ConfigPath)) { Write-Log "Config não encontrado: $ConfigPath"; return }
  $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
  $m = Get-Metrics
  $sys = Get-SystemInfo
  $body = @{
    agent_token   = $cfg.agent_token
    cpu_usage     = $m.cpu
    ram_usage     = $m.ram
    disk_usage    = $m.disk
    ip_address    = $sys.ip_address
    agent_version = $AgentVersion
    os_version    = $sys.os_version
    tailscale_ip  = $sys.tailscale_ip
  }
  try {
    $inv = Get-Inventory
    foreach ($k in $inv.Keys) { $body[$k] = $inv[$k] }
  } catch {
    Write-Log ("Inventário falhou: {0}" -f $_.Exception.Message)
  }
  $json = $body | ConvertTo-Json -Compress -Depth 6
  try {
    $resp = Invoke-RestMethod -Method Post -Uri ("{0}/api/public/agent/heartbeat" -f $cfg.base_url) `
      -ContentType "application/json" -Body $json -TimeoutSec 60
    Write-Log ("Heartbeat OK cpu={0} ram={1} disk={2}" -f $m.cpu, $m.ram, $m.disk)
    if ($resp -and $resp.commands) { Process-Commands $cfg $resp.commands }
  } catch {
    Write-Log ("Heartbeat falhou: {0}" -f $_.Exception.Message)
  }
}

function Install-AutotechsAgent {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)] [string]$BaseUrl,
    [Parameter(Mandatory)] [string]$EnrollToken
  )

  if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute o PowerShell como Administrador."
  }

  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Write-Log "Iniciando instalação do agente Autotechs RMM..."

  # Baixa este script para uso pelo Scheduled Task
  try {
    Invoke-WebRequest -Uri ("{0}/agent/install.ps1" -f $BaseUrl.TrimEnd("/")) -OutFile $AgentPath -UseBasicParsing
  } catch {
    Copy-Item -Path $PSCommandPath -Destination $AgentPath -Force -ErrorAction SilentlyContinue
  }
  if (-not (Test-Path $AgentPath)) { throw "Falha ao gravar agente em $AgentPath" }

  # Enroll
  $sys = Get-SystemInfo
  $payload = @{
    token         = $EnrollToken
    hostname      = $sys.hostname
    os            = $sys.os
    os_version    = $sys.os_version
    ip_address    = $sys.ip_address
    mac_address   = $sys.mac_address
    agent_version = $AgentVersion
    type          = "workstation"
  } | ConvertTo-Json -Compress

  Write-Log "Registrando endpoint..."
  $resp = Invoke-RestMethod -Method Post -Uri ("{0}/api/public/agent/enroll" -f $BaseUrl.TrimEnd("/")) `
    -ContentType "application/json" -Body $payload -TimeoutSec 30

  if (-not $resp.agent_token) { throw "Resposta inválida: $($resp | ConvertTo-Json)" }

  $cfg = @{
    base_url     = $BaseUrl.TrimEnd("/")
    endpoint_id  = $resp.endpoint_id
    agent_token  = $resp.agent_token
    installed_at = (Get-Date).ToString("o")
  }
  $cfg | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
  Write-Log "Endpoint registrado: $($resp.endpoint_id)"

  # Registra Scheduled Task (a cada 1 min, como SYSTEM)
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`" -Mode Heartbeat" -f $AgentPath)
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1)
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Description "Autotechs RMM Agent" | Out-Null

  Write-Log "Scheduled Task '$TaskName' criada (intervalo: 1 min)."
  Enable-RdpAccess
  if ($resp.tailscale_auth_key) {
    Install-Tailscale -authKey $resp.tailscale_auth_key -hostname $sys.hostname
  } else {
    Write-Log "Tailscale: backend não forneceu auth key — pulando."
  }
  Invoke-Heartbeat
  Write-Log "Instalação concluída."
}

function Uninstall-AutotechsAgent {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Agente removido."
}

# Modo de execução
switch ($Mode) {
  "Heartbeat" { Invoke-Heartbeat }
  "Install"   {
    if ($BaseUrl -and $EnrollToken) { Install-AutotechsAgent -BaseUrl $BaseUrl -EnrollToken $EnrollToken }
  }
}