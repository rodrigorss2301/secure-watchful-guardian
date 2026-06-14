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
$AgentVersion = "1.1.0"
$InstallDir   = "C:\ProgramData\AutotechsRMM"
$ConfigPath   = Join-Path $InstallDir "config.json"
$AgentPath    = Join-Path $InstallDir "agent.ps1"
$LogPath      = Join-Path $InstallDir "agent.log"
$TaskName     = "AutotechsRMMAgent"

function Write-Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  try { Add-Content -Path $LogPath -Value $line -ErrorAction SilentlyContinue } catch {}
  Write-Host $line
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
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown" } |
      Select-Object -First 1).IPAddress
  } catch {}
  $mac = $null
  try {
    $mac = (Get-NetAdapter -Physical -ErrorAction Stop | Where-Object Status -eq "Up" | Select-Object -First 1).MacAddress
  } catch {}
  return @{
    hostname   = $env:COMPUTERNAME
    os         = $os.Caption
    os_version = $os.Version
    ip_address = $ip
    mac_address = $mac
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
  }
  try {
    $inv = Get-Inventory
    foreach ($k in $inv.Keys) { $body[$k] = $inv[$k] }
  } catch {
    Write-Log ("Inventário falhou: {0}" -f $_.Exception.Message)
  }
  $json = $body | ConvertTo-Json -Compress -Depth 6
  try {
    Invoke-RestMethod -Method Post -Uri ("{0}/api/public/agent/heartbeat" -f $cfg.base_url) `
      -ContentType "application/json" -Body $json -TimeoutSec 60 | Out-Null
    Write-Log ("Heartbeat OK cpu={0} ram={1} disk={2}" -f $m.cpu, $m.ram, $m.disk)
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