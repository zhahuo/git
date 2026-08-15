@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    python -m agent run
) else (
    echo 未找到 python，请先安装 Python 3.11 或更高版本。
)

pause
