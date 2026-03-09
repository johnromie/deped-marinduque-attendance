param(
  [string]$WorkDir = "c:\Users\User\Desktop\app"
)

$nodeExe = Join-Path $env:LOCALAPPDATA "nodejs\node-v22.22.0-win-x64\node.exe"
$cloudflaredExe = Join-Path $WorkDir "tools\cloudflared.exe"

Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $nodeExe -or -not $_.Path } | Stop-Process -Force
Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $cloudflaredExe -or -not $_.Path } | Stop-Process -Force
Write-Output "Stopped app and tunnel processes."
