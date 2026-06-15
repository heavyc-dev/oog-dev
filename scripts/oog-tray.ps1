# oog-tray.ps1 — run the oog.dev bridge in the system tray (no terminal window).
# Caveman tray icon; right-click for Open / Copy token / Restart / Quit. Auto-restarts on crash.
# Launch hidden at logon:  powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File scripts\oog-tray.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# read URL + token from .env (for the menu actions)
$envMap = @{}
if (Test-Path (Join-Path $root ".env")) {
  foreach ($line in Get-Content (Join-Path $root ".env")) {
    if ($line -match '^\s*([^#=][^=]*)=(.*)$') { $envMap[$matches[1].Trim()] = $matches[2].Trim().Trim('"') }
  }
}
$url = $envMap["OOG_URL"]
$token = $envMap["AUTH_TOKEN"]

# start the bridge hidden; track the process so we can kill its whole tree
$script:proc = $null
function Start-Bridge {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/c npm start"
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.WindowStyle = "Hidden"
  $script:proc = [System.Diagnostics.Process]::Start($psi)
}
function Stop-Bridge {
  if ($script:proc -and -not $script:proc.HasExited) {
    Start-Process -FilePath "taskkill" -ArgumentList "/F","/T","/PID",$script:proc.Id -NoNewWindow -Wait -ErrorAction SilentlyContinue
  }
  $script:proc = $null
}
Start-Bridge

$ni = New-Object System.Windows.Forms.NotifyIcon
$icoPath = Join-Path $root "public\assets\oog.ico"
try { $ni.Icon = New-Object System.Drawing.Icon($icoPath) } catch { $ni.Icon = [System.Drawing.SystemIcons]::Application }
$ni.Text = "oog.dev bridge"
$ni.Visible = $true
$ni.ShowBalloonTip(3000, "oog.dev", "Bridge running. OOGA.", [System.Windows.Forms.ToolTipIcon]::Info)

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$mOpen = $menu.Items.Add("Open in browser")
$mOpen.add_Click({ if ($url) { Start-Process $url } })
$mTok = $menu.Items.Add("Copy auth token")
$mTok.add_Click({ if ($token) { Set-Clipboard -Value $token; $ni.ShowBalloonTip(2000, "oog.dev", "Token copied to clipboard", [System.Windows.Forms.ToolTipIcon]::Info) } })
$mRestart = $menu.Items.Add("Restart bridge")
$mRestart.add_Click({ Stop-Bridge; Start-Sleep -Milliseconds 600; Start-Bridge; $ni.ShowBalloonTip(2000, "oog.dev", "Bridge restarted", [System.Windows.Forms.ToolTipIcon]::Info) })
[void]$menu.Items.Add("-")
$mQuit = $menu.Items.Add("Quit")
$mQuit.add_Click({ Stop-Bridge; $ni.Visible = $false; $ni.Dispose(); [System.Windows.Forms.Application]::Exit() })
$ni.ContextMenuStrip = $menu
$ni.add_MouseDoubleClick({ if ($url) { Start-Process $url } })

# watchdog: relaunch the bridge if it dies
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({ if ($script:proc -eq $null -or $script:proc.HasExited) { Start-Bridge } })
$timer.Start()

[System.Windows.Forms.Application]::Run()
