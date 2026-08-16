@echo off
chcp 65001 >nul
cd /d "%~dp0"
set AGENT_BACKGROUND=1

where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" /b pythonw -m agent run
) else (
    start "" /b "C:\Users\袁\AppData\Local\Programs\Python\Python312\pythonw.exe" -m agent run
)
