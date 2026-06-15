# install.ps1 - register oog.dev as a per-user app (no admin):
#   * Start Menu shortcut (launch it like any app)
#   * Startup shortcut  -> appears in Settings > Apps > Startup as a toggle
#   * Uninstall entry   -> appears in Settings > Apps > Installed apps (with Uninstall)
# The code stays in this repo folder; uninstall just removes the shortcuts + registry entry.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tray = Join-Path $root "scripts\oog-tray.ps1"
$ico  = Join-Path $root "public\assets\oog.ico"
$ps   = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$psArgs = '-ExecutionPolicy Bypass -WindowStyle Hidden -STA -File "' + $tray + '"'

$ws = New-Object -ComObject WScript.Shell
function New-OogShortcut($path) {
  $sc = $ws.CreateShortcut($path)
  $sc.TargetPath = $ps
  $sc.Arguments = $psArgs
  $sc.WorkingDirectory = $root
  if (Test-Path $ico) { $sc.IconLocation = $ico }
  $sc.Description = "oog.dev - drive Claude Code from your phone"
  $sc.WindowStyle = 7
  $sc.Save()
}
$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) "oog.dev.lnk"
$startup   = Join-Path ([Environment]::GetFolderPath("Startup")) "oog.dev.lnk"
New-OogShortcut $startMenu
New-OogShortcut $startup

# Installed-apps (uninstall) entry, per-user -> no admin needed
$key = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\oog.dev"
New-Item -Path $key -Force | Out-Null
Set-ItemProperty $key DisplayName "oog.dev"
Set-ItemProperty $key DisplayVersion "1.0.0"
Set-ItemProperty $key Publisher "oog.dev"
if (Test-Path $ico) { Set-ItemProperty $key DisplayIcon $ico }
Set-ItemProperty $key InstallLocation $root
Set-ItemProperty $key UninstallString ('"' + $ps + '" -ExecutionPolicy Bypass -File "' + (Join-Path $root "scripts\uninstall.ps1") + '"')
Set-ItemProperty $key NoModify 1 -Type DWord
Set-ItemProperty $key NoRepair 1 -Type DWord

# clean up the older scheduled-task mechanism if a previous setup created it
schtasks /Delete /TN "oog.dev-bridge" /F 2>$null | Out-Null

Write-Host "Installed oog.dev."
Write-Host " - Start Menu: search 'oog.dev'"
Write-Host " - Startup toggle: Settings > Apps > Startup"
Write-Host " - Uninstall: Settings > Apps > Installed apps > oog.dev"
Write-Host "Starting it now..."
Start-Process $ps -ArgumentList $psArgs
