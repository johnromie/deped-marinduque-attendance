@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "WORKDIR=%~dp0.."
for %%I in ("%WORKDIR%") do set "WORKDIR=%%~fI"
set "NODE_EXE=%LOCALAPPDATA%\nodejs\node-v22.22.0-win-x64\node.exe"
set "CF_EXE=%WORKDIR%\tools\cloudflared.exe"
set "LOGDIR=%WORKDIR%\logs"
set "NODE_OUT=%LOGDIR%\node.out.log"
set "NODE_ERR=%LOGDIR%\node.err.log"
set "CF_OUT=%LOGDIR%\cloudflared.out.log"
set "CF_ERR=%LOGDIR%\cloudflared.err.log"
set "URL_FILE=%LOGDIR%\public-url.txt"
set "CF_MODE=quick"
if defined CF_TUNNEL_TOKEN set "CF_MODE=named"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
if not exist "%NODE_EXE%" (
  echo Node.exe not found: %NODE_EXE%
  exit /b 1
)
if not exist "%CF_EXE%" (
  echo cloudflared.exe not found: %CF_EXE%
  exit /b 1
)

taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 1 /nobreak >nul

del /q "%NODE_OUT%" "%NODE_ERR%" "%CF_OUT%" "%CF_ERR%" "%URL_FILE%" 2>nul

start "" /min cmd /c ""%NODE_EXE%" "%WORKDIR%\server.js" 1>>"%NODE_OUT%" 2>>"%NODE_ERR%""
timeout /t 3 /nobreak >nul

if /I "%CF_MODE%"=="named" (
  start "" /min cmd /c ""%CF_EXE%" tunnel run --token %CF_TUNNEL_TOKEN% 1>>"%CF_OUT%" 2>>"%CF_ERR%""
) else (
  start "" /min cmd /c ""%CF_EXE%" tunnel --url http://localhost:4000 --no-autoupdate --metrics localhost:0 1>>"%CF_OUT%" 2>>"%CF_ERR%""
)

set "URL="
for /L %%N in (1,1,40) do (
  for /f "tokens=* delims=" %%U in ('findstr /R /C:"https://[a-z0-9-][a-z0-9-]*\.trycloudflare\.com" "%CF_ERR%" "%CF_OUT%" 2^>nul') do (
    set "LINE=%%U"
    for %%P in (!LINE!) do (
      set "T=%%~P"
      set "T=!T:|=!"
      echo !T!| findstr /R /C:"^https://[a-z0-9-][a-z0-9-]*\.trycloudflare\.com$" >nul && set "URL=!T!"
    )
  )
  if /I "%CF_MODE%"=="named" if defined PUBLIC_APP_URL set "URL=%PUBLIC_APP_URL%"
  if defined URL goto :FOUND
  timeout /t 2 /nobreak >nul
)

if /I "%CF_MODE%"=="named" (
  echo Tunnel started in named mode. Set PUBLIC_APP_URL environment variable to display your fixed URL.
  echo Example: setx PUBLIC_APP_URL https://your-subdomain.yourdomain.com
  exit /b 0
)

echo Tunnel URL not found yet. Check logs\cloudflared.err.log
exit /b 1

:FOUND
echo %URL%>"%URL_FILE%"
echo %URL%
exit /b 0
