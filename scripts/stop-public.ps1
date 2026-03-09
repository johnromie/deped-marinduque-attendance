param(
  [string]$WorkDir
)

if (-not $WorkDir) {
  $WorkDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$nodeExe = Join-Path $env:LOCALAPPDATA "nodejs\node-v22.22.0-win-x64\node.exe"
if (!(Test-Path $nodeExe)) {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($nodeCmd) { $nodeExe = $nodeCmd.Source }
}

$cloudflaredExe = Join-Path $WorkDir "tools\cloudflared.exe"

Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $nodeExe -or -not $_.Path } | Stop-Process -Force
Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $cloudflaredExe -or -not $_.Path } | Stop-Process -Force
Write-Output "Stopped app and tunnel processes."
