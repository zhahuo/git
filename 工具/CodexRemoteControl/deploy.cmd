@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
if errorlevel 1 (
  echo.
  echo Deployment failed.
  pause
  exit /b 1
)
echo.
pause
