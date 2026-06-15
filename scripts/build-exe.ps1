# build-exe.ps1 - package the GUI wizard into dist\oog-setup.exe (caveman icon, no console).
# Run:  npm run build:exe    (installs the ps2exe module on first use)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$gui = Join-Path $root "scripts\oog-setup-gui.ps1"
$ico = Join-Path $root "public\assets\oog.ico"
$outDir = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$exe = Join-Path $outDir "oog-setup.exe"

if (-not (Get-Module -ListAvailable -Name ps2exe)) {
  Write-Host "Installing ps2exe (one-time, CurrentUser)..."
  try { Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null } catch {}
  Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
}
Import-Module ps2exe

Invoke-ps2exe -inputFile $gui -outputFile $exe -iconFile $ico -noConsole -STA `
  -title "oog.dev setup" -product "oog.dev" -description "oog.dev setup wizard" -company "oog.dev"
Write-Host ""
Write-Host "Built: $exe"
Write-Host "Double-click it, or ship it next to the repo. (Windows SmartScreen may warn on first run - it's unsigned.)"
