@echo off
cd /d "%~dp0"
set "NODE_BIN=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
netstat -ano | findstr ":3740" | findstr "LISTENING" >nul 2>&1 && exit /b 0
"%NODE_BIN%\node.exe" server.cjs > "%~dp0power.log" 2>&1
