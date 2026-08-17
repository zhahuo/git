@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Codex消耗悬浮窗.lnk'); $s.TargetPath='%~dp0start.cmd'; $s.WorkingDirectory='%~dp0'; $s.Save()"
echo 已添加开机自启。
