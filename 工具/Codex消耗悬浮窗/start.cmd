@echo off
cd /d "%~dp0"
start "" "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\pythonw.exe" codex_bridge.py
