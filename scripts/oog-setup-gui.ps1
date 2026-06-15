# oog-setup-gui.ps1 - clickable, themed setup wizard. Collects choices in a window, then runs
# setup.mjs non-interactively (OOG_NI=1 + OOG_* answers) so the logic is never forked.
# Launch: double-click oog-setup.cmd  |  npm run setup:gui  |  the built oog-setup.exe
$ErrorActionPreference = "Stop"
# make the process DPI-aware BEFORE any window exists, or Windows bitmap-scales it (blurry on hi-DPI).
try {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class OogDpi {
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  [DllImport("shcore.dll")] static extern int SetProcessDpiAwareness(int v);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  public static void On() {
    try { if (SetProcessDpiAwarenessContext((IntPtr)(-4))) return; } catch {}   // PerMonitorV2 (Win10 1703+)
    try { if (SetProcessDpiAwareness(2) == 0) return; } catch {}                 // PerMonitor (Win8.1+)
    try { SetProcessDPIAware(); } catch {}                                       // System (Vista+)
  }
}
"@
  [OogDpi]::On()
} catch {}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

# resolve repo root: works as a .ps1 (in scripts/) AND as the built .exe (in dist/).
# Build candidate roots from every source we can, then pick whichever actually holds setup.mjs.
$self = $PSCommandPath
if (-not $self -and $MyInvocation.MyCommand.Path) { $self = $MyInvocation.MyCommand.Path }
$cands = New-Object System.Collections.Generic.List[string]
if ($self) { $cands.Add((Split-Path -Parent (Split-Path -Parent $self))) }      # ps1 in scripts\ -> repo root
if ($PSScriptRoot) { $cands.Add((Split-Path -Parent $PSScriptRoot)) }
try {
  $exe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName    # exe path (or powershell.exe)
  $exeDir = Split-Path -Parent $exe
  $cands.Add($exeDir); $cands.Add((Split-Path -Parent $exeDir))                   # exe at root, or in dist\
} catch {}
$cands.Add((Get-Location).Path); $cands.Add((Split-Path -Parent (Get-Location).Path))
$root = $null
foreach ($c in $cands) { if ($c -and (Test-Path (Join-Path $c "setup.mjs"))) { $root = $c; break } }
if (-not $root) {
  [System.Windows.Forms.MessageBox]::Show("Couldn't find setup.mjs. Keep oog-setup.exe inside the oog repo (or its dist\ folder), or run oog-setup.cmd from the repo.", "oog.dev setup", "OK", "Error") | Out-Null
  return
}
$script:root = $root

# cave palette
$cBg = [System.Drawing.Color]::FromArgb(36, 25, 16)
$cPanel = [System.Drawing.Color]::FromArgb(21, 17, 10)
$cBone = [System.Drawing.Color]::FromArgb(239, 227, 198)
$cTorch = [System.Drawing.Color]::FromArgb(232, 160, 46)
$cEmber = [System.Drawing.Color]::FromArgb(232, 122, 46)
$cRock = [System.Drawing.Color]::FromArgb(91, 68, 48)
$fBody = New-Object System.Drawing.Font("Segoe UI", 10)
$fHead = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)

function Get-TailnetName {
  try { $j = (& tailscale status --json | Out-String | ConvertFrom-Json); return ($j.Self.DNSName -replace '\.$', '') } catch { return "" }
}

$form = New-Object System.Windows.Forms.Form
$form.AutoScaleDimensions = New-Object System.Drawing.SizeF(96, 96)
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$form.Text = "oog.dev setup"
$form.ClientSize = New-Object System.Drawing.Size(540, 660)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"; $form.MaximizeBox = $false
$form.BackColor = $cBg; $form.ForeColor = $cBone; $form.Font = $fBody
$ico = Join-Path $root "public\assets\oog.ico"
if (Test-Path $ico) { try { $form.Icon = New-Object System.Drawing.Icon($ico) } catch {} }

# header: caveman + title
$pic = New-Object System.Windows.Forms.PictureBox
$pic.SizeMode = "Zoom"; $pic.Size = New-Object System.Drawing.Size(64, 76); $pic.Location = New-Object System.Drawing.Point(20, 16)
$hero = Join-Path $root "public\assets\oog-hero.png"
if (Test-Path $hero) { try { $pic.Image = [System.Drawing.Image]::FromFile($hero) } catch {} }
$form.Controls.Add($pic)
$title = New-Object System.Windows.Forms.Label
$title.Text = "oog.dev"; $title.Font = $fHead; $title.ForeColor = $cTorch; $title.AutoSize = $true; $title.Location = New-Object System.Drawing.Point(96, 24)
$form.Controls.Add($title)
$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Host Claude Code here, drive it from your phone."; $sub.AutoSize = $true; $sub.ForeColor = $cBone; $sub.Location = New-Object System.Drawing.Point(98, 56)
$form.Controls.Add($sub)

$y = 104
function Add-Label($text) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text; $l.AutoSize = $true; $l.ForeColor = $cBone; $l.Location = New-Object System.Drawing.Point(20, $script:y)
  $form.Controls.Add($l); $script:y += 22; return $l
}
function Style-Text($tb) { $tb.BackColor = $cPanel; $tb.ForeColor = $cBone; $tb.BorderStyle = "FixedSingle" }

# token
$cbGen = New-Object System.Windows.Forms.CheckBox
$cbGen.Text = "Generate a strong token for me"; $cbGen.Checked = $true; $cbGen.AutoSize = $true; $cbGen.ForeColor = $cBone
$cbGen.Location = New-Object System.Drawing.Point(20, $y); $form.Controls.Add($cbGen); $y += 26
$tbToken = New-Object System.Windows.Forms.TextBox
$tbToken.Location = New-Object System.Drawing.Point(20, $y); $tbToken.Size = New-Object System.Drawing.Size(496, 24); Style-Text $tbToken
$tbToken.Enabled = $false; try { $tbToken.PlaceholderText = "...or paste your own token" } catch {}
$form.Controls.Add($tbToken); $y += 36
$cbGen.add_CheckedChanged({ $tbToken.Enabled = -not $cbGen.Checked })

# code folder
Add-Label "Folder that holds your repos (the cave picker):" | Out-Null
$tbDir = New-Object System.Windows.Forms.TextBox
$def = Join-Path $env:USERPROFILE ".code"; if (-not (Test-Path $def)) { $def = $env:USERPROFILE }
$tbDir.Text = $def; $tbDir.Location = New-Object System.Drawing.Point(20, $y); $tbDir.Size = New-Object System.Drawing.Size(406, 24); Style-Text $tbDir
$form.Controls.Add($tbDir)
$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = "Browse..."; $btnBrowse.Location = New-Object System.Drawing.Point(432, ($y - 1)); $btnBrowse.Size = New-Object System.Drawing.Size(84, 26)
$btnBrowse.FlatStyle = "Flat"; $btnBrowse.BackColor = $cRock; $btnBrowse.ForeColor = $cBone; $btnBrowse.FlatAppearance.BorderSize = 0
$btnBrowse.add_Click({ $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq "OK") { $tbDir.Text = $d.SelectedPath } })
$form.Controls.Add($btnBrowse); $y += 38

# access mode
$grp = New-Object System.Windows.Forms.GroupBox
$grp.Text = "How will you reach it?"; $grp.ForeColor = $cTorch; $grp.Location = New-Object System.Drawing.Point(20, $y); $grp.Size = New-Object System.Drawing.Size(496, 98)
$rbTail = New-Object System.Windows.Forms.RadioButton; $rbTail.Text = "Phone over Tailscale (recommended)"; $rbTail.ForeColor = $cBone; $rbTail.Location = New-Object System.Drawing.Point(14, 22); $rbTail.AutoSize = $true; $rbTail.Checked = $true
$rbOog = New-Object System.Windows.Forms.RadioButton; $rbOog.Text = "Local on this PC at https://oog.dev"; $rbOog.ForeColor = $cBone; $rbOog.Location = New-Object System.Drawing.Point(14, 46); $rbOog.AutoSize = $true
$rbLocal = New-Object System.Windows.Forms.RadioButton; $rbLocal.Text = "Plain http://localhost (quick test)"; $rbLocal.ForeColor = $cBone; $rbLocal.Location = New-Object System.Drawing.Point(14, 70); $rbLocal.AutoSize = $true
$grp.Controls.AddRange(@($rbTail, $rbOog, $rbLocal)); $form.Controls.Add($grp); $y += 106

# tailnet hostname
$lblHost = Add-Label "Tailnet hostname (auto-detected; edit if blank):"
$tbHost = New-Object System.Windows.Forms.TextBox
$tbHost.Location = New-Object System.Drawing.Point(20, $y); $tbHost.Size = New-Object System.Drawing.Size(496, 24); Style-Text $tbHost
$tbHost.Text = (Get-TailnetName)
$form.Controls.Add($tbHost); $y += 34
$toggleHost = { $vis = $rbTail.Checked; $lblHost.Visible = $vis; $tbHost.Visible = $vis }
$rbTail.add_CheckedChanged($toggleHost); $rbOog.add_CheckedChanged($toggleHost); $rbLocal.add_CheckedChanged($toggleHost)

# options
function Add-Check($text, $checked) {
  $cb = New-Object System.Windows.Forms.CheckBox
  $cb.Text = $text; $cb.Checked = $checked; $cb.AutoSize = $true; $cb.ForeColor = $cBone; $cb.Location = New-Object System.Drawing.Point(20, $script:y)
  $form.Controls.Add($cb); $script:y += 24; return $cb
}
$cbApprove = Add-Check "Phone approvals (Allow/Deny on phone)" $true
$cbTray = Add-Check "Run in system tray at log on (no terminal)" $true
$cbStart = Add-Check "Start oog now when setup finishes" $true
$cbResume = Add-Check "Auto-resume caves on start" $false
$y += 8

# set up button
$btnGo = New-Object System.Windows.Forms.Button
$btnGo.Text = "Set up oog"; $btnGo.Location = New-Object System.Drawing.Point(20, $y); $btnGo.Size = New-Object System.Drawing.Size(496, 38)
$btnGo.FlatStyle = "Flat"; $btnGo.BackColor = $cEmber; $btnGo.ForeColor = [System.Drawing.Color]::FromArgb(42, 22, 7); $btnGo.FlatAppearance.BorderSize = 0
$btnGo.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($btnGo); $y += 46

# output log
$out = New-Object System.Windows.Forms.TextBox
$out.Multiline = $true; $out.ScrollBars = "Vertical"; $out.ReadOnly = $true
$out.Location = New-Object System.Drawing.Point(20, $y); $out.Size = New-Object System.Drawing.Size(496, 120)
$out.BackColor = $cPanel; $out.ForeColor = $cBone; $out.BorderStyle = "FixedSingle"
$out.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($out)

function Strip-Ansi($s) { return ($s -replace "\x1b\[[0-9;]*m", "") }
function b01($c) { if ($c) { "1" } else { "0" } }

$btnGo.add_Click({
  $btnGo.Enabled = $false; $btnGo.Text = "Setting up..."
  $out.Text = "Setting up..." + [Environment]::NewLine
  $mode = "1"
  if ($rbOog.Checked) { $mode = "0" } elseif ($rbLocal.Checked) { $mode = "2" }
  $script:logFile = Join-Path $env:TEMP ("oog-setup-" + [System.Guid]::NewGuid().ToString("N") + ".log")

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = '/c node setup.mjs > "' + $script:logFile + '" 2>&1'
  $psi.WorkingDirectory = $script:root
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.WindowStyle = "Hidden"
  $e = $psi.EnvironmentVariables
  $e["OOG_NI"] = "1"
  $e["OOG_GEN_TOKEN"] = (b01 $cbGen.Checked)
  if ((-not $cbGen.Checked) -and $tbToken.Text.Trim()) { $e["OOG_TOKEN"] = $tbToken.Text.Trim() }
  $e["OOG_CODE_ROOT"] = $tbDir.Text.Trim()
  $e["OOG_MODE_IDX"] = $mode
  if ($mode -eq "1") { $e["OOG_HOSTNAME"] = $tbHost.Text.Trim(); $e["OOG_RUN_SERVE"] = "1" }
  $e["OOG_APPROVALS"] = (b01 $cbApprove.Checked)
  $e["OOG_AUTORESUME"] = (b01 $cbResume.Checked)
  $e["OOG_TRAY"] = (b01 $cbTray.Checked)
  $e["OOG_REINSTALL"] = "0"
  $script:proc = [System.Diagnostics.Process]::Start($psi)

  $script:timer = New-Object System.Windows.Forms.Timer
  $script:timer.Interval = 600
  $script:timer.add_Tick({
    if ($script:logFile -and (Test-Path $script:logFile)) { try { $out.Text = (Strip-Ansi ([System.IO.File]::ReadAllText($script:logFile))); $out.SelectionStart = $out.Text.Length; $out.ScrollToCaret() } catch {} }
    if ($script:proc.HasExited) {
      $script:timer.Stop(); $btnGo.Enabled = $true; $btnGo.Text = "Set up oog"
      $envFile = Join-Path $script:root ".env"; $tok = ""; $url = ""
      if (Test-Path $envFile) { foreach ($l in Get-Content $envFile) { if ($l -match '^AUTH_TOKEN=(.*)$') { $tok = $matches[1].Trim('"') }; if ($l -match '^OOG_URL=(.*)$') { $url = $matches[1].Trim('"') } } }
      # launch the bridge now (tray) if requested
      if ($cbStart.Checked) {
        try { Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-WindowStyle', 'Hidden', '-File', (Join-Path $script:root 'scripts\oog-tray.ps1') } catch {}
      }
      $nl = [Environment]::NewLine
      $msg = "Done."
      if ($cbStart.Checked) { $msg += " oog is starting in the system tray." }
      if ($url) { $msg += $nl + $nl + "Open: " + $url }
      if ($tok) { $msg += $nl + "Token: " + $tok + $nl + $nl + "Tip: npm start (or the tray) prints a QR you can scan on your phone."; Set-Clipboard -Value $tok; $msg += $nl + $nl + "(Token copied to clipboard.)" }
      [System.Windows.Forms.MessageBox]::Show($msg, "oog.dev ready", "OK", "Information") | Out-Null
    }
  })
  $script:timer.Start()
})

if ($env:OOG_GUI_NOSHOW -ne "1") { [void]$form.ShowDialog() }
