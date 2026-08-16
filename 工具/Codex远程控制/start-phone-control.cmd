@echo off
setlocal
set "NODE_BIN=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "PATH=%NODE_BIN%;%PATH%"
set "HOST=0.0.0.0"
set "PORT=3737"
set "CODEX_DESKTOP_APP_PATH=C:\Program Files\WindowsApps\OpenAI.Codex_26.810.6296.0_x64__2p2nqsd0c76g0\app\resources"
set "CODEX_APP_SERVER_BINARY_PATH=%USERPROFILE%\.codex\.sandbox-bin\codex.exe"
set "CODEX_CLI_PATH=%USERPROFILE%\.codex\.sandbox-bin\codex.exe"
netstat -ano | findstr ":3737" | findstr "LISTENING" >nul 2>&1 && exit /b 0
"%NODE_BIN%\node.exe" "%~dp0scripts\start-gateway.cjs" > "%~dp0gateway.log" 2>&1
endlocal
