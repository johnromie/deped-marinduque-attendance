param(
  [Parameter(Mandatory = $true)][string]$TunnelToken,
  [Parameter(Mandatory = $true)][string]$PublicUrl,
  [string]$WorkDir
)

$ErrorActionPreference = "Stop"
if (-not $WorkDir) {
  $WorkDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

if ($PublicUrl -notmatch '^https://') {
  throw "PublicUrl must start with https://"
}

[Environment]::SetEnvironmentVariable("CF_TUNNEL_TOKEN", $TunnelToken, "User")
[Environment]::SetEnvironmentVariable("PUBLIC_APP_URL", $PublicUrl, "User")
$env:CF_TUNNEL_TOKEN = $TunnelToken
$env:PUBLIC_APP_URL = $PublicUrl

Write-Output "Saved CF_TUNNEL_TOKEN and PUBLIC_APP_URL to User environment."

& (Join-Path $PSScriptRoot "install-autostart.ps1") -WorkDir $WorkDir -StartNow
& (Join-Path $PSScriptRoot "run-public.ps1") -WorkDir $WorkDir
