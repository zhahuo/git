@echo off
cd /d "%~dp0"
start "xiaoxiaocsgo-server" cmd /k call "%~dp0启动联机服务器.cmd"
start "xiaoxiaocsgo-client" cmd /k call "%~dp0启动联机客户端.cmd"
timeout /t 4 >nul
start http://127.0.0.1:5173
