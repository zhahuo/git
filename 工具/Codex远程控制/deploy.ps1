param(
  [switch]$SkipInstall,
  [string]$UserProfile = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
if (-not $UserProfile) {
  $UserProfile = $env:USERPROFILE
}
$env:USERPROFILE = $UserProfile
$env:CODEX_HOME = Join-Path $UserProfile ".codex"

function Write-Step([string]$message) {
  Write-Host ("[一键部署] " + $message) -ForegroundColor Cyan
}

function Test-Port([int]$port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect("127.0.0.1", $port)
    $client.Dispose()
    return $true
  } catch {
    return $false
  }
}

function Start-Hidden([string]$command, [string]$arguments, [string]$workingDirectory) {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $command
  $info.Arguments = $arguments
  $info.WorkingDirectory = $workingDirectory
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  [System.Diagnostics.Process]::Start($info) | Out-Null
}

function Start-ServicesDetached {
  $vbsPath = Join-Path $root "start-services.vbs"
  $phoneScript = Join-Path $root "start-phone-control.cmd"
  $powerScript = Join-Path $root "power-control\start-power-control.cmd"
  $lines = @(
    'Set shell = CreateObject("WScript.Shell")',
    ('shell.Run "' + 'cmd.exe /c ""' + $phoneScript + '""' + '", 0, False'),
    ('shell.Run "' + 'cmd.exe /c ""' + $powerScript + '""' + '", 0, False')
  )
  $vbsContent = $lines -join "`r`n"
  [System.IO.File]::WriteAllText($vbsPath, $vbsContent, [System.Text.UnicodeEncoding]::new($false, $true))
  & wscript.exe $vbsPath
}

# 1. 查找 Node.js 和 pnpm
$nodeExe = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$pnpmCmd = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if (-not (Test-Path $nodeExe)) {
  $foundNode = Get-Command node -ErrorAction SilentlyContinue
  if ($foundNode) { $nodeExe = $foundNode.Source }
}
if (-not (Test-Path $pnpmCmd)) {
  $foundPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($foundPnpm) { $pnpmCmd = $foundPnpm.Source }
}
if (-not (Test-Path $nodeExe) -or -not (Test-Path $pnpmCmd)) {
  throw "未找到 Node.js 或 pnpm，请先安装 Node.js 和 pnpm"
}
Write-Step "Node.js 和 pnpm 就绪"

# 2. 检查 Codex/ChatGPT Desktop
$codexRoot = $null
$codexPackage = Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($codexPackage -and (Test-Path (Join-Path $codexPackage.InstallLocation "app\resources\app.asar"))) {
  $codexRoot = Get-Item $codexPackage.InstallLocation
} else {
  foreach ($searchRoot in @("$env:ProgramFiles\WindowsApps", "D:\WindowsApps")) {
    if (Test-Path $searchRoot) {
      $codexRoot = Get-ChildItem $searchRoot -Directory -Filter "OpenAI.Codex_*" -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName "app\resources\app.asar") } |
        Select-Object -First 1
      if ($codexRoot) { break }
    }
  }
}
if (-not $codexRoot) {
  throw "未检测到 Codex/ChatGPT Desktop，请先安装 Codex Desktop"
}
Write-Step ("检测到 Codex Desktop: " + $codexRoot.FullName)

# 根据检测结果修正一键启动脚本里的 Codex Desktop 路径
$codexResources = Join-Path $codexRoot.FullName "app\resources"
$startPhoneScript = Join-Path $root "start-phone-control.cmd"
if (Test-Path $startPhoneScript) {
  $startText = [System.IO.File]::ReadAllText($startPhoneScript, [System.Text.UTF8Encoding]::new($false))
  $startText = [regex]::Replace(
    $startText,
    'set "CODEX_DESKTOP_APP_PATH=.*"',
    ('set "CODEX_DESKTOP_APP_PATH=' + $codexResources + '"')
  )
  [System.IO.File]::WriteAllText($startPhoneScript, $startText, [System.Text.UTF8Encoding]::new($false))
  Write-Step "已更新 Codex Desktop 路径"
}

# 3. 安装依赖
if (-not $SkipInstall) {
  Write-Step "安装依赖，请稍候..."
  $previousSkip = $env:ELECTRON_SKIP_BINARY_DOWNLOAD
  $env:ELECTRON_SKIP_BINARY_DOWNLOAD = "1"
  & $pnpmCmd install --registry=https://registry.npmmirror.com
  $installExit = $LASTEXITCODE
  if ($null -eq $previousSkip) {
    Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue
  } else {
    $env:ELECTRON_SKIP_BINARY_DOWNLOAD = $previousSkip
  }
  if ($installExit -ne 0) { throw "依赖安装失败" }
}

# 4. 生成或复用访问密码
$configPath = Join-Path $root "config.yaml"
$passwordFile = Join-Path $root "deploy-password.txt"
$password = $null
if (-not (Test-Path $configPath)) {
  $chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  $password = -join (1..20 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
  Set-Content -Path $passwordFile -Value $password -Encoding UTF8
  Set-Content -Path $configPath -Value ("auth:`n  password: `"$password`"") -Encoding UTF8
  Write-Step "已生成新的访问密码"
} elseif (Test-Path $passwordFile) {
  $password = (Get-Content $passwordFile -Raw).Trim()
}

# 5. 启动 OpenCodex
if (-not (Test-Port 3737)) {
  Write-Step "启动 OpenCodex..."
  Start-ServicesDetached
  for ($i = 0; $i -lt 60; $i++) {
    if (Test-Port 3737) { break }
    Start-Sleep -Seconds 2
  }
  if (-not (Test-Port 3737)) { throw "OpenCodex 启动失败，请查看 gateway.log" }
} else {
  Write-Step "OpenCodex 已在运行"
}

# 6. 启动电源控制
if (-not (Test-Port 3740)) {
  Write-Step "启动电源控制..."
  for ($i = 0; $i -lt 15; $i++) {
    if (Test-Port 3740) { break }
    Start-Sleep -Seconds 1
  }
  if (-not (Test-Port 3740)) { throw "电源控制启动失败，请查看 power-control\power.log" }
} else {
  Write-Step "电源控制已在运行"
}

# 7. 应用熄屏保持运行策略
try {
  & (Join-Path $root "keep-running.cmd") | Out-Host
  Write-Step "熄屏保持运行设置已应用"
} catch {
  Write-Warning ("熄屏保持运行设置未应用: " + $_.Exception.Message)
}

# 7.1 配置系统级开机自启动（开机即启动，无需登录）
Write-Step "配置开机自启动..."
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$systemTaskName = "CodexRemoteControlSystem"
if ($isAdmin) {
  try {
    $taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
      '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $root 'deploy.ps1') + '" -SkipInstall -UserProfile "' + $UserProfile + '"'
    )
    $taskTrigger = New-ScheduledTaskTrigger -AtStartup
    $taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $systemTaskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Force | Out-Null
    $userShortcut = Join-Path $UserProfile "AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\CodexRemoteControl.lnk"
    if (Test-Path $userShortcut) {
      Remove-Item -LiteralPath $userShortcut -Force
    }
    Write-Step ("系统级自启动已启用: " + $systemTaskName)
  } catch {
    Write-Warning ("系统级自启动配置失败: " + $_.Exception.Message)
  }
} else {
  $startupDir = Join-Path $UserProfile "AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
  try {
    $wsh = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path $startupDir "CodexRemoteControl.lnk"
    $shortcut = $wsh.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $root 'deploy.ps1') + '" -SkipInstall -UserProfile "' + $UserProfile + '"'
    $shortcut.WorkingDirectory = $root
    $shortcut.Save()
    Write-Step ("已启用登录后自启动，系统级自启动需要管理员权限: " + $shortcutPath)
    Write-Step "请右键以管理员身份运行 install-system-autostart.cmd 切换为开机自启动"
  } catch {
    Write-Warning ("登录后自启动配置失败: " + $_.Exception.Message)
  }
}

# 7.2 检查 Tailscale
$tailscaleIp = $null
$tailscaleCmd = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $tailscaleCmd) {
  $tailscaleCmd = Get-Item "C:\Program Files\Tailscale\tailscale.exe" -ErrorAction SilentlyContinue
}
if (-not $tailscaleCmd) {
  $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
  if ($wingetCmd) {
    Write-Step "未检测到 Tailscale，尝试自动安装..."
    & $wingetCmd.Source install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements | Out-Host
    $tailscaleCmd = Get-Command tailscale -ErrorAction SilentlyContinue
    if (-not $tailscaleCmd) { $tailscaleCmd = Get-Item "C:\Program Files\Tailscale\tailscale.exe" -ErrorAction SilentlyContinue }
  } else {
    Write-Warning "未检测到 Tailscale，请到 https://tailscale.com/download 安装后重新部署"
  }
}
if ($tailscaleCmd) {
  $tailscaleAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceAlias -eq "Tailscale" } |
    Select-Object -First 1
  if ($tailscaleAddress) {
    $tailscaleIp = $tailscaleAddress.IPAddress
    Write-Step ("Tailscale 已就绪: " + $tailscaleIp)
  } else {
    Write-Step "Tailscale 未登录，正在打开登录页面，请在浏览器完成登录..."
    try {
      Start-Process -FilePath $tailscaleCmd.Source -ArgumentList "up" -WindowStyle Hidden
    } catch {
      Write-Warning ("Tailscale 登录启动失败: " + $_.Exception.Message)
    }
    for ($i = 0; $i -lt 30 -and -not $tailscaleIp; $i++) {
      Start-Sleep -Seconds 2
      $tailscaleAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -eq "Tailscale" } |
        Select-Object -First 1
      if ($tailscaleAddress) { $tailscaleIp = $tailscaleAddress.IPAddress }
    }
    if ($tailscaleIp) {
      Write-Step ("Tailscale 登录完成: " + $tailscaleIp)
    } else {
      Write-Warning "Tailscale 尚未登录完成，手机远程请稍后重试或手动运行 tailscale up"
    }
  }
} else {
  Write-Warning "Tailscale 不可用，手机远程功能需要 Tailscale"
}

# 8. 输出访问信息
$lanIp = $null
try {
  $lanAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "Tailscale*" } |
    Select-Object -First 1
  if ($lanAddress) { $lanIp = $lanAddress.IPAddress }
  if (-not $tailscaleIp) {
    $tailscaleAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.InterfaceAlias -eq "Tailscale" } |
      Select-Object -First 1
    if ($tailscaleAddress) { $tailscaleIp = $tailscaleAddress.IPAddress }
  }
} catch {}
if (-not $lanIp) { $lanIp = "局域网IP(请用 ipconfig 查询)" }

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "部署完成" -ForegroundColor Green
Write-Host "OpenCodex 本机:  http://127.0.0.1:3737"
Write-Host "OpenCodex 局域网: http://${lanIp}:3737"
if ($tailscaleIp) { Write-Host "OpenCodex Tailscale: http://${tailscaleIp}:3737" }
if ($tailscaleIp) { Write-Host "电源控制 Tailscale:  http://${tailscaleIp}:3740" } else { Write-Host "电源控制局域网:      http://${lanIp}:3740" }
if ($password) {
  Write-Host "访问密码: $password" -ForegroundColor Yellow
} else {
  Write-Host "访问密码: 使用现有 config.yaml 的密码" -ForegroundColor Yellow
}
Write-Host "================================================" -ForegroundColor Green
