$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 使用捆绑 Node 运行时（PyExecJS 依赖）
$env:Path = 'C:\Users\袁\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path

# 加载 .env（如存在）
$EnvFile = Join-Path $ProjectDir '.env'
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            $idx = $line.IndexOf('=')
            if ($idx -gt 0) {
                $key = $line.Substring(0, $idx).Trim()
                $val = $line.Substring($idx + 1).Trim().Trim('"')
                [Environment]::SetEnvironmentVariable($key, $val, 'Process')
            }
        }
    }
}

if (-not $env:BROWSER_CHANNEL) {
    $env:BROWSER_CHANNEL = 'msedge'
}

$Python = Join-Path $ProjectDir 'venv\Scripts\python.exe'
if (-not (Test-Path $Python)) {
    Write-Error "未找到 venv: $Python，请先运行 python -m venv venv 并安装 requirements.txt"
}

Write-Host "启动闲鱼自动回复系统: http://localhost:$($env:API_PORT ?? 8090)"
& $Python (Join-Path $ProjectDir 'Start.py')
