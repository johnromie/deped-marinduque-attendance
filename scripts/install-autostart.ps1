param(
  [string]$WorkDir,
  [switch]$StartNow
)

if (-not $WorkDir) {
  $WorkDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$taskName = "DepEdAttendancePublic"
$scriptPath = Join-Path $WorkDir "scripts\run-public.ps1"
$command = ('powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "{0}" -WorkDir "{1}"' -f $scriptPath, $WorkDir)

schtasks /Create /TN $taskName /SC ONLOGON /TR $command /RL LIMITED /F | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create scheduled task '$taskName'."
}

Write-Output "Task '$taskName' installed. App+tunnel will start on Windows logon."

if ($StartNow) {
  schtasks /Run /TN $taskName | Out-Null
  Write-Output "Task '$taskName' started now."
}
