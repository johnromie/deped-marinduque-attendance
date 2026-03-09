param(
  [Parameter(Mandatory = $true)][string]$RenderUrl,
  [string]$WorkDir
)

$ErrorActionPreference = "Stop"
if (-not $WorkDir) {
  $WorkDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$cleanUrl = $RenderUrl.Trim()
if ($cleanUrl -notmatch "^https://") {
  throw "RenderUrl must start with https://"
}

$envSavedToUserProfile = $true
try {
  [Environment]::SetEnvironmentVariable("RENDER_PUBLIC_URL", $cleanUrl, "User")
  [Environment]::SetEnvironmentVariable("PUBLIC_APP_URL", "", "User")
  [Environment]::SetEnvironmentVariable("CF_TUNNEL_TOKEN", "", "User")
} catch {
  $envSavedToUserProfile = $false
}

$env:RENDER_PUBLIC_URL = $cleanUrl
Remove-Item Env:PUBLIC_APP_URL -ErrorAction SilentlyContinue
Remove-Item Env:CF_TUNNEL_TOKEN -ErrorAction SilentlyContinue

$urlFile = Join-Path $WorkDir "logs\public-url.txt"
$renderUrlFile = Join-Path $WorkDir "logs\render-public-url.txt"
if (!(Test-Path (Split-Path $urlFile -Parent))) {
  New-Item -ItemType Directory -Path (Split-Path $urlFile -Parent) -Force | Out-Null
}
Set-Content -Path $urlFile -Value $cleanUrl -Encoding ASCII
Set-Content -Path $renderUrlFile -Value $cleanUrl -Encoding ASCII

if ($envSavedToUserProfile) {
  Write-Output "Saved Render stable URL to user environment."
} else {
  Write-Output "Saved Render stable URL to project logs (user environment update was blocked)."
}
Write-Output $cleanUrl
try {
  Set-Clipboard -Value $cleanUrl -ErrorAction Stop
  Write-Output "Copied URL to clipboard."
} catch {
  # Clipboard might not be available in some sessions.
}
