@echo off
setlocal EnableExtensions

if "%~1"=="" (
  echo Usage: scripts\setup-stable-link.cmd ^<CF_TUNNEL_TOKEN^> ^<PUBLIC_APP_URL^>
  exit /b 1
)
if "%~2"=="" (
  echo Usage: scripts\setup-stable-link.cmd ^<CF_TUNNEL_TOKEN^> ^<PUBLIC_APP_URL^>
  exit /b 1
)

set "WORKDIR=%~dp0.."
for %%I in ("%WORKDIR%") do set "WORKDIR=%%~fI"
set "PS_SCRIPT=%~dp0setup-stable-link.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -TunnelToken "%~1" -PublicUrl "%~2" -WorkDir "%WORKDIR%"
exit /b %ERRORLEVEL%
