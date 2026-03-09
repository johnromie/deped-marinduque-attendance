@echo off
setlocal EnableExtensions

if "%~1"=="" (
  echo Usage: scripts\setup-render-url.cmd ^<RENDER_PUBLIC_URL^>
  exit /b 1
)

set "WORKDIR=%~dp0.."
for %%I in ("%WORKDIR%") do set "WORKDIR=%%~fI"
set "PS_SCRIPT=%~dp0setup-render-url.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -RenderUrl "%~1" -WorkDir "%WORKDIR%"
exit /b %ERRORLEVEL%
