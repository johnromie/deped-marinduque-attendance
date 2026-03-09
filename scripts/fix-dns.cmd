@echo off
setlocal EnableExtensions
set "PS_SCRIPT=%~dp0fix-dns.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
exit /b %ERRORLEVEL%
