# uninstall.ps1 - remove the oog.dev app registration (shortcuts + uninstall entry + any task).
# Leaves the repo folder in place (delete it yourself if you want the code gone).
$ErrorActionPreference = "SilentlyContinue"
Remove-Item (Join-Path ([Environment]::GetFolderPath("Programs")) "oog.dev.lnk") -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath("Startup")) "oog.dev.lnk") -Force
Remove-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\oog.dev" -Recurse -Force
schtasks /Delete /TN "oog.dev-bridge" /F 2>$null | Out-Null
Write-Host "Uninstalled oog.dev (the repo folder was left in place)."
