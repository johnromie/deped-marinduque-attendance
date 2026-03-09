param()

$adminRole = [Security.Principal.WindowsBuiltInRole]::Administrator
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole($adminRole)) {
  $args = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $args | Out-Null
  exit 0
}

$ErrorActionPreference = "Stop"

$v4Servers = @("1.1.1.1", "8.8.8.8")
$v6Servers = @("2606:4700:4700::1111", "2001:4860:4860::8888")

$upAdapters = Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" }
if (-not $upAdapters) {
  throw "No active physical network adapters found."
}

foreach ($adapter in $upAdapters) {
  Set-DnsClientServerAddress -InterfaceAlias $adapter.Name -ServerAddresses $v4Servers
  try {
    Set-DnsClientServerAddress -InterfaceAlias $adapter.Name -AddressFamily IPv6 -ServerAddresses $v6Servers
  } catch {
    # IPv6 might be disabled on some adapters; continue.
  }
}

Clear-DnsClientCache
ipconfig /flushdns | Out-Null

Write-Output "DNS updated to Cloudflare/Google on active adapters."
Write-Output "Now rerun scripts\\run-public.cmd and use scripts\\get-public-url.cmd."
