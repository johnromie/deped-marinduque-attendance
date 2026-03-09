param(
  [string]$WorkDir
)

if (-not $WorkDir) {
  $WorkDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$urlFile = Join-Path $WorkDir "logs\public-url.txt"
$cfOut = Join-Path $WorkDir "logs\cloudflared.out.log"
$cfErr = Join-Path $WorkDir "logs\cloudflared.err.log"
$renderUrlFile = Join-Path $WorkDir "logs\render-public-url.txt"

function Test-PublicUrl {
  param([Parameter(Mandatory = $true)][string]$Url)
  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500)
  } catch {
    return $false
  }
}

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

function Get-LatestTunnelUrl {
  param(
    [string[]]$LogPaths
  )

  $match = Select-String -Path $LogPaths -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches -ErrorAction SilentlyContinue |
    Select-Object -Last 1

  if ($match -and $match.Matches.Count -gt 0) {
    return $match.Matches[$match.Matches.Count - 1].Value
  }

  return $null
}

function Write-UrlResult {
  param([Parameter(Mandatory = $true)][string]$Url)

  Set-Content -Path $urlFile -Value $Url -Encoding ASCII
  Write-Output $Url
  try {
    Set-Clipboard -Value $Url -ErrorAction Stop
    Write-Output "Copied URL to clipboard."
  } catch {
    # Clipboard might not be available in some sessions.
  }

  if (Test-PublicUrl -Url $Url) {
    Write-Output "Public URL is reachable."
    exit 0
  }

  $hostName = ([Uri]$Url).Host
  $resolvedBySystemDns = Test-DnsResolved -HostName $hostName
  $resolvedByCloudflareDns = Test-DnsResolved -HostName $hostName -Server "1.1.1.1"
  if (-not $resolvedBySystemDns -and $resolvedByCloudflareDns) {
    Write-Output "Warning: local DNS cannot resolve tunnel domain. Run scripts\\fix-dns.cmd as Administrator."
  } else {
    Write-Output "Warning: URL not reachable yet. Retry after 10-20 seconds."
  }
  exit 0
}

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
  Write-Output "Using Render stable URL."
  Write-UrlResult -Url $renderUrl
}

# Named tunnel mode: fixed URL is required for one stable link.
if ($namedMode) {
  if ($fixedUrl) {
    Write-UrlResult -Url $fixedUrl
  }

  Write-Output "Named tunnel is configured but PUBLIC_APP_URL is empty."
  Write-Output "Set PUBLIC_APP_URL to your fixed domain, then rerun this command."
  exit 1
}

# Quick tunnel mode: discover latest temporary URL.
$logPaths = @($cfErr, $cfOut) | Where-Object { Test-Path $_ }
$url = $null
if ($logPaths.Count -gt 0) {
  $url = Get-LatestTunnelUrl -LogPaths $logPaths
}

if (-not $url -and (Test-Path $urlFile)) {
  $saved = (Get-Content $urlFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($saved) {
    $url = $saved.Trim()
  }
}

if ($url) {
  Write-UrlResult -Url $url
}

if (Get-Process cloudflared -ErrorAction SilentlyContinue) {
  Write-Output "No public URL found yet. Tunnel is still starting, then run scripts\\get-public-url.cmd again."
} else {
  Write-Output "No public URL found yet. Run scripts\\run-public.cmd first."
}
exit 1
