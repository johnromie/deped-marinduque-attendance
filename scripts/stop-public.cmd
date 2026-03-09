@echo off
taskkill /F /IM cloudflared.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo Stopped app and tunnel processes.
exit /b 0

