@echo off
cd /d "%~dp0"
echo Installing system-level autostart, please run as administrator...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -SkipInstall -UserProfile "%USERPROFILE%"
if errorlevel 1 (
  echo.
  echo Install failed.
  pause
  exit /b 1
)
echo.
echo System autostart installed.
pause
