param(
  [string]$WorkDir = "c:\Users\User\Desktop\app"
)

$taskName = "DepEdAttendancePublic"
$scriptPath = Join-Path $WorkDir "scripts\run-public.ps1"
$command = ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $scriptPath)

schtasks /Create /TN $taskName /SC ONLOGON /TR $command /RL LIMITED /F | Out-Null
Write-Output "Task '$taskName' installed. It will start app+tunnel on user logon."
