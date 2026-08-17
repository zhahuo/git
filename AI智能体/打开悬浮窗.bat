@echo off
chcp 65001 >nul
cd /d "%~dp0"

where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw -m scripts.open_dashboard
) else (
    start "" "C:\Users\袁\AppData\Local\Programs\Python\Python312\pythonw.exe" -m scripts.open_dashboard
)
