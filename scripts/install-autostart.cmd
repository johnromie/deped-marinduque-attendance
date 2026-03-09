@echo off
setlocal EnableExtensions

set "WORKDIR=%~dp0.."
for %%I in ("%WORKDIR%") do set "WORKDIR=%%~fI"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP%\DepEdAttendancePublic.cmd"
set "RUN_CMD=%WORKDIR%\scripts\run-public.cmd"

(
  echo @echo off
  echo cd /d "%WORKDIR%"
  echo call "%RUN_CMD%"
)>"%TARGET%"

echo Startup launcher created:
echo %TARGET%
echo App+tunnel will run on Windows logon even if VS Code is closed.
exit /b 0

