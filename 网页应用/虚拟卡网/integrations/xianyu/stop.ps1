$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pattern = [regex]::Escape($ProjectDir) + '.*Start\.py'

$targets = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object { $_.CommandLine -match $pattern }

if (-not $targets) {
    Write-Host '没有找到正在运行的 Start.py 进程'
    exit 0
}

foreach ($proc in $targets) {
    Write-Host "停止进程 PID=$($proc.ProcessId)"
    Stop-Process -Id $proc.ProcessId -Force
}
