@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  set "NODE_EXE=node"
) else (
  set "NODE_EXE=C:\Users\袁\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
echo Starting xiaoxiaocsgo client at http://127.0.0.1:5173
"%NODE_EXE%" "node_modules\vite\bin\vite.js" --host 0.0.0.0 --port 5173
pause
