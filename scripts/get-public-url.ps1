param(
  [string]$WorkDir = "c:\Users\User\Desktop\app"
)

$urlFile = Join-Path $WorkDir "logs\public-url.txt"
$cfOut = Join-Path $WorkDir "logs\cloudflared.out.log"
$cfErr = Join-Path $WorkDir "logs\cloudflared.err.log"

if (Test-Path $urlFile) {
  $saved = (Get-Content $urlFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($saved) {
    try {
      $resp = Invoke-WebRequest -Uri $saved -UseBasicParsing -TimeoutSec 8
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        Write-Output $saved
        exit 0
      }
    } catch {
      # Saved URL is stale/dead, continue to discover latest URL from logs.
    }
  }
}

$url = $null
if (Test-Path $cfOut) {
  $url = (Select-String -Path $cfOut -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1).Matches.Value
}
if (-not $url -and (Test-Path $cfErr)) {
  $url = (Select-String -Path $cfErr -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1).Matches.Value
}

if ($url) {
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
      Set-Content -Path $urlFile -Value $url -Encoding ASCII
      Write-Output $url
      exit 0
    }
  } catch {
    Write-Output "Latest tunnel URL found but not reachable yet: $url"
    exit 1
  }
}

Write-Output "No public URL found yet. Run scripts\\run-public.ps1 first."
