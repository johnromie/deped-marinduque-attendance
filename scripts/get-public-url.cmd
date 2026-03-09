@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "WORKDIR=%~dp0.."
for %%I in ("%WORKDIR%") do set "WORKDIR=%%~fI"
set "LOGDIR=%WORKDIR%\logs"
set "URL_FILE=%LOGDIR%\public-url.txt"
set "CF_OUT=%LOGDIR%\cloudflared.out.log"
set "CF_ERR=%LOGDIR%\cloudflared.err.log"
set "CF_ROOT_LOG=%WORKDIR%\cloudflared.log"

set "URL="
if exist "%URL_FILE%" (
  set /p URL=<"%URL_FILE%"
  if defined URL (
    echo %URL%
    exit /b 0
  )
)

for /f "tokens=* delims=" %%U in ('findstr /R /C:"https://[a-z0-9-][a-z0-9-]*\.trycloudflare\.com" "%CF_ERR%" "%CF_OUT%" "%CF_ROOT_LOG%" 2^>nul') do (
  set "LINE=%%U"
  for %%P in (!LINE!) do (
    set "T=%%~P"
    set "T=!T:|=!"
    echo !T!| findstr /R /C:"^https://[a-z0-9-][a-z0-9-]*\.trycloudflare\.com$" >nul && set "URL=!T!"
  )
)

if defined URL (
  echo %URL%>"%URL_FILE%"
  echo %URL%
  exit /b 0
)

echo No public URL found yet. Run scripts\run-public.cmd first.
exit /b 1
