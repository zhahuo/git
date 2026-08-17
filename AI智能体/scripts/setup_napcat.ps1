param(
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ToolsDir = Join-Path $Root "tools"
$NapCatDir = Join-Path $ToolsDir "NapCat"

New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

function Get-Release {
    if ($Version -eq "latest") {
        return Invoke-RestMethod -Uri "https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest" -Headers @{ "User-Agent" = "AI-Agent-NapCat-Setup" }
    }
    return Invoke-RestMethod -Uri "https://api.github.com/repos/NapNeko/NapCatQQ/releases/tags/$Version" -Headers @{ "User-Agent" = "AI-Agent-NapCat-Setup" }
}

$Release = Get-Release
$Asset = $Release.assets | Where-Object { $_.name -eq "NapCat.Shell.Windows.OneKey.zip" } | Select-Object -First 1
if (-not $Asset) {
    $Asset = $Release.assets | Where-Object { $_.name -eq "NapCat.Shell.zip" } | Select-Object -First 1
}
if (-not $Asset) {
    throw "NapCat Windows package not found in release $($Release.tag_name)."
}

$ZipPath = Join-Path $ToolsDir $Asset.name
if (-not (Test-Path -LiteralPath $ZipPath)) {
    Write-Host "Downloading $($Asset.name)..."
    Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $ZipPath
}

Write-Host "Extracting to $NapCatDir"
if (Test-Path -LiteralPath $NapCatDir) {
    Remove-Item -LiteralPath $NapCatDir -Recurse -Force
}
Expand-Archive -LiteralPath $ZipPath -DestinationPath $NapCatDir -Force

$Installer = Get-ChildItem -Path $NapCatDir -Filter "NapCatInstaller.exe" -Recurse | Select-Object -First 1
if ($Installer) {
    Write-Host "Starting $($Installer.FullName)"
    Start-Process -FilePath $Installer.FullName -WorkingDirectory $Installer.DirectoryName
} else {
    Write-Host "No NapCatInstaller.exe found. Open $NapCatDir and follow the included README."
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Complete the installer and scan the QQ QR code with your phone."
Write-Host "2. Open NapCat WebUI at http://127.0.0.1:6099"
Write-Host "3. Add an OneBot11 WebSocket server on port 3001."
Write-Host "4. Set QQ_ENABLED=1 in .env and start the agent."
