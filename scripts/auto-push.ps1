param(
  [string]$WorkDir,
  [int]$DebounceSeconds = 4
)

if (-not $WorkDir) {
  $WorkDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$logDir = Join-Path $WorkDir "logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logPath = Join-Path $logDir "auto-push.log"

function Write-Log([string]$Message) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $logPath -Value "$stamp $Message"
}

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $WorkDir
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

$ignore = @(
  "\.git\",
  "\node_modules\",
  "\logs\",
  "\uploads\",
  "\data\",
  "\apk\",
  "\android\.gradle\",
  "\android\app\build\"
)

$script:pending = $false
$script:lastChange = Get-Date

function Should-Ignore([string]$Path) {
  $p = $Path.ToLowerInvariant()
  foreach ($rule in $ignore) {
    if ($p.Contains($rule)) { return $true }
  }
  return $false
}

$handler = {
  if (Should-Ignore $Event.SourceEventArgs.FullPath) { return }
  $script:pending = $true
  $script:lastChange = Get-Date
}

Register-ObjectEvent -InputObject $watcher -EventName Created -Action $handler | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $handler | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action $handler | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $handler | Out-Null

Write-Log "Auto-push watcher started in $WorkDir"

while ($true) {
  if ($script:pending -and ((Get-Date) - $script:lastChange).TotalSeconds -ge $DebounceSeconds) {
    $script:pending = $false
    try {
      Set-Location $WorkDir
      git add -A | Out-Null
      $status = git status --porcelain
      if (-not $status) { continue }
      $msg = "Auto update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
      git commit -m $msg | Out-Null
      git push origin main | Out-Null
      Write-Log "Pushed changes."
    } catch {
      Write-Log "Auto-push error: $($_.Exception.Message)"
    }
  }
  Start-Sleep -Seconds 1
}
