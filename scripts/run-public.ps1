param(
  [string]$WorkDir
)

$ErrorActionPreference = "Stop"
if (-not $WorkDir) {
  $WorkDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$nodeExe = Join-Path $env:LOCALAPPDATA "nodejs\node-v22.22.0-win-x64\node.exe"
if (!(Test-Path $nodeExe)) {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($nodeCmd) {
    $nodeExe = $nodeCmd.Source
  } else {
    throw "Node.exe not found. Install Node.js and make sure 'node' is in PATH."
  }
}

$cloudflaredExe = Join-Path $WorkDir "tools\cloudflared.exe"
$logsDir = Join-Path $WorkDir "logs"

if (!(Test-Path $cloudflaredExe)) { throw "cloudflared.exe not found at $cloudflaredExe" }
if (!(Test-Path $logsDir)) { New-Item -ItemType Directory -Force $logsDir | Out-Null }

function Test-DnsResolved {
  param(
    [Parameter(Mandatory = $true)][string]$HostName,
    [string]$Server
  )

  try {
    if ($Server) {
      Resolve-DnsName -Name $HostName -Server $Server -Type A -ErrorAction Stop | Out-Null
    } else {
      Resolve-DnsName -Name $HostName -Type A -ErrorAction Stop | Out-Null
    }
    return $true
  } catch {
    return $false
  }
}

$nodeOut = Join-Path $logsDir "node.out.log"
$nodeErr = Join-Path $logsDir "node.err.log"
$cfOut = Join-Path $logsDir "cloudflared.out.log"
$cfErr = Join-Path $logsDir "cloudflared.err.log"
$urlFile = Join-Path $logsDir "public-url.txt"
$renderUrlFile = Join-Path $logsDir "render-public-url.txt"

$cfToken = ""
if ($env:CF_TUNNEL_TOKEN) {
  $cfToken = $env:CF_TUNNEL_TOKEN.Trim()
}
$renderUrl = ""
if ($env:RENDER_PUBLIC_URL) {
  $renderUrl = $env:RENDER_PUBLIC_URL.Trim()
}
if (-not $renderUrl -and (Test-Path $renderUrlFile)) {
  $savedRenderUrl = (Get-Content $renderUrlFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($savedRenderUrl) {
    $renderUrl = $savedRenderUrl.Trim()
  }
}
$fixedUrl = ""
if ($env:PUBLIC_APP_URL) {
  $fixedUrl = $env:PUBLIC_APP_URL.Trim()
}
$namedMode = ($cfToken.Length -gt 0)

if ($renderUrl) {
  Set-Content -Path $renderUrlFile -Value $renderUrl -Encoding ASCII
  Set-Content -Path $urlFile -Value $renderUrl -Encoding ASCII
  Write-Output $renderUrl
  try {
    Set-Clipboard -Value $renderUrl -ErrorAction Stop
    Write-Output "Copied URL to clipboard."
  } catch {
    # Clipboard might not be available in some sessions.
  }

  $renderReachable = $false
  try {
    $resp = Invoke-WebRequest -Uri $renderUrl -UseBasicParsing -TimeoutSec 10
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
      $renderReachable = $true
    }
  } catch {
    # Network can fail temporarily.
  }

  if ($renderReachable) {
    Write-Output "Using Render stable URL. No local tunnel start needed."
  } else {
    Write-Output "Render URL is saved but not reachable from this network right now."
  }
  exit 0
}

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

if (Test-Path $nodeOut) { Remove-Item $nodeOut -Force -ErrorAction SilentlyContinue }
if (Test-Path $nodeErr) { Remove-Item $nodeErr -Force -ErrorAction SilentlyContinue }
if (Test-Path $cfOut) { Remove-Item $cfOut -Force -ErrorAction SilentlyContinue }
if (Test-Path $cfErr) { Remove-Item $cfErr -Force -ErrorAction SilentlyContinue }
if (Test-Path $urlFile) { Remove-Item $urlFile -Force -ErrorAction SilentlyContinue }

Start-Process -FilePath $nodeExe -ArgumentList "server.js" -WorkingDirectory $WorkDir -WindowStyle Hidden -RedirectStandardOutput $nodeOut -RedirectStandardError $nodeErr | Out-Null
Start-Sleep -Seconds 2

try {
  $status = (Invoke-WebRequest "http://127.0.0.1:4000" -UseBasicParsing -TimeoutSec 8).StatusCode
  if ($status -lt 200 -or $status -ge 500) {
    throw "Local server unhealthy. HTTP status=$status"
  }
} catch {
  throw "Node server failed to start. Check $nodeErr"
}

if ($namedMode) {
  Start-Process -FilePath $cloudflaredExe -ArgumentList "tunnel run --token $cfToken --no-autoupdate" -WorkingDirectory $WorkDir -WindowStyle Hidden -RedirectStandardOutput $cfOut -RedirectStandardError $cfErr | Out-Null
} else {
  Start-Process -FilePath $cloudflaredExe -ArgumentList "tunnel --url http://localhost:4000 --protocol http2 --no-autoupdate --metrics localhost:0" -WorkingDirectory $WorkDir -WindowStyle Hidden -RedirectStandardOutput $cfOut -RedirectStandardError $cfErr | Out-Null
}

$url = $null
if ($fixedUrl) {
  $url = $fixedUrl
} else {
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $cfOut) {
      $candidate = (Select-String -Path $cfOut -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1).Matches.Value
      if ($candidate) { $url = $candidate }
    }
    if (-not $url -and (Test-Path $cfErr)) {
      $candidate = (Select-String -Path $cfErr -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1).Matches.Value
      if ($candidate) { $url = $candidate }
    }

    if ($url) { break }
    Start-Sleep -Seconds 2
  }
}

if (-not $url) {
  if ($namedMode) {
    throw "Named tunnel is running but PUBLIC_APP_URL is not set. Set PUBLIC_APP_URL to your fixed URL."
  }
  throw "Tunnel URL not found yet. Check $cfErr"
}

Set-Content -Path $urlFile -Value $url -Encoding ASCII
Write-Output $url
try {
  Set-Clipboard -Value $url -ErrorAction Stop
  Write-Output "Copied URL to clipboard."
} catch {
  # Clipboard might not be available in some sessions.
}

$reachable = $false
$deadline = (Get-Date).AddSeconds(40)
while ((Get-Date) -lt $deadline) {
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
      $reachable = $true
      break
    }
  } catch {
    # DNS propagation or tunnel warmup can fail briefly.
  }
  Start-Sleep -Seconds 2
}

if ($reachable) {
  Write-Output "Public URL is reachable."
  exit 0
}

$hostName = ([Uri]$url).Host
$resolvedBySystemDns = Test-DnsResolved -HostName $hostName
$resolvedByCloudflareDns = Test-DnsResolved -HostName $hostName -Server "1.1.1.1"
if (-not $resolvedBySystemDns -and $resolvedByCloudflareDns) {
  Write-Output "Public URL generated, but your local DNS cannot resolve it."
  Write-Output "Run scripts\\fix-dns.cmd as Administrator, then rerun scripts\\get-public-url.cmd."
} elseif ($namedMode -and $fixedUrl) {
  Write-Output "Fixed URL not reachable yet. Check Cloudflare DNS + tunnel token settings."
} else {
  Write-Output "Public URL generated but still warming up. Run scripts\\get-public-url.cmd after 10-20 seconds."
}
exit 0
