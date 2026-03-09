param(
  [string]$WorkDir = "c:\Users\User\Desktop\app"
)

$ErrorActionPreference = "Stop"
$nodeExe = Join-Path $env:LOCALAPPDATA "nodejs\node-v22.22.0-win-x64\node.exe"
$cloudflaredExe = Join-Path $WorkDir "tools\cloudflared.exe"
$logsDir = Join-Path $WorkDir "logs"

if (!(Test-Path $nodeExe)) { throw "Node.exe not found at $nodeExe" }
if (!(Test-Path $cloudflaredExe)) { throw "cloudflared.exe not found at $cloudflaredExe" }
if (!(Test-Path $logsDir)) { New-Item -ItemType Directory -Force $logsDir | Out-Null }

$nodeOut = Join-Path $logsDir "node.out.log"
$nodeErr = Join-Path $logsDir "node.err.log"
$cfOut = Join-Path $logsDir "cloudflared.out.log"
$cfErr = Join-Path $logsDir "cloudflared.err.log"
$urlFile = Join-Path $logsDir "public-url.txt"

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

Start-Process -FilePath $cloudflaredExe -ArgumentList "tunnel --url http://localhost:4000 --no-autoupdate --metrics localhost:0" -WorkingDirectory $WorkDir -WindowStyle Hidden -RedirectStandardOutput $cfOut -RedirectStandardError $cfErr | Out-Null

$url = $null
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  if (Test-Path $cfOut) {
    $candidate = (Select-String -Path $cfOut -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1).Matches.Value
    if ($candidate) { $url = $candidate }
  }
  if (-not $url -and (Test-Path $cfErr)) {
    $candidate = (Select-String -Path $cfErr -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1).Matches.Value
    if ($candidate) { $url = $candidate }
  }

  if ($url) {
    try {
      $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        Set-Content -Path $urlFile -Value $url -Encoding ASCII
        Write-Output $url
        exit 0
      }
    } catch {
      # DNS propagation or tunnel warmup can fail briefly.
    }
  }
  Start-Sleep -Seconds 2
}

if ($url) {
  Set-Content -Path $urlFile -Value $url -Encoding ASCII
  throw "Tunnel created but not reachable yet. Retry in 10 seconds: $url"
}

throw "Tunnel URL not found yet. Check $cfErr"
