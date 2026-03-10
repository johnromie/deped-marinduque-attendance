@echo off
setlocal EnableExtensions

set "WORKDIR=%~dp0.."
for %%I in ("%WORKDIR%") do set "WORKDIR=%%~fI"
set "PS_SCRIPT=%~dp0auto-push.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -WorkDir "%WORKDIR%"
exit /b %ERRORLEVEL%
