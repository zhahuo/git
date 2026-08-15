@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  set "NODE_EXE=node"
) else (
  set "NODE_EXE=C:\Users\袁\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
set "GAME_HOST=0.0.0.0"
set "GAME_PORT=2567"
set "GAME_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174"
echo Starting xiaoxiaocsgo multiplayer server on ws://0.0.0.0:2567
"%NODE_EXE%" "server\index.mjs"
pause
