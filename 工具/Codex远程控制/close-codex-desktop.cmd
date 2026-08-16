@echo off
echo Closing Codex/ChatGPT Desktop...
taskkill /F /IM ChatGPT.exe >nul 2>&1
taskkill /F /IM Codex.exe >nul 2>&1
taskkill /F /IM codex.exe >nul 2>&1
timeout /t 2 /nobreak >nul
del /q "%USERPROFILE%\.codex\thread-writer-locks\*.lock" >nul 2>&1
echo Done. Please restart the web service with start-services.vbs.
pause
