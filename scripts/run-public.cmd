@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "WORKDIR=%~dp0.."
for %%I in ("%WORKDIR%") do set "WORKDIR=%%~fI"
set "PS_SCRIPT=%~dp0run-public.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -WorkDir "%WORKDIR%"
exit /b %ERRORLEVEL%
