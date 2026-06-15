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

$INNER = 540   # width of full-width controls inside the panel
$form = New-Object System.Windows.Forms.Form
$form.AutoScaleDimensions = New-Object System.Drawing.SizeF(96, 96)
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$form.Text = "oog.dev setup"
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"; $form.MaximizeBox = $false
$form.BackColor = $cBg; $form.ForeColor = $cBone; $form.Font = $fBody
$form.ClientSize = New-Object System.Drawing.Size(600, 700)
$ico = Join-Path $root "public\assets\oog.ico"
if (Test-Path $ico) { try { $form.Icon = New-Object System.Drawing.Icon($ico) } catch {} }

# everything lives in a top-down flow panel: each row auto-sizes to its real height (no overlap)
$panel = New-Object System.Windows.Forms.FlowLayoutPanel
$panel.Dock = "Fill"; $panel.FlowDirection = "TopDown"; $panel.WrapContents = $false; $panel.AutoScroll = $true
$panel.BackColor = $cBg; $panel.Padding = New-Object System.Windows.Forms.Padding(24, 16, 24, 20)
$form.Controls.Add($panel)

function Add-Row($c, $top) { $c.Margin = New-Object System.Windows.Forms.Padding(0, $top, 0, 0); [void]$panel.Controls.Add($c) }
function Style-Text($tb) { $tb.BackColor = $cPanel; $tb.ForeColor = $cBone; $tb.BorderStyle = "FixedSingle"; $tb.Width = $INNER }
function New-Section($text) {
  $l = New-Object System.Windows.Forms.Label; $l.Text = $text; $l.AutoSize = $true; $l.ForeColor = $cTorch
  $l.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
  Add-Row $l 13
}
function New-Caption($text) {
  $l = New-Object System.Windows.Forms.Label; $l.Text = $text; $l.AutoSize = $true; $l.ForeColor = $cBone
  Add-Row $l 6; return $l
}

# header: caveman + title
$header = New-Object System.Windows.Forms.Panel
$header.AutoSize = $true; $header.AutoSizeMode = "GrowAndShrink"; $header.MinimumSize = New-Object System.Drawing.Size($INNER, 74)
$pic = New-Object System.Windows.Forms.PictureBox
$pic.SizeMode = "Zoom"; $pic.Size = New-Object System.Drawing.Size(58, 70); $pic.Location = New-Object System.Drawing.Point(0, 4)
$hero = Join-Path $root "public\assets\oog-hero.png"
if (Test-Path $hero) { try { $pic.Image = [System.Drawing.Image]::FromFile($hero) } catch {} }
$title = New-Object System.Windows.Forms.Label
$title.Text = "oog.dev"; $title.Font = (New-Object System.Drawing.Font("Segoe UI", 17, [System.Drawing.FontStyle]::Bold)); $title.ForeColor = $cTorch; $title.AutoSize = $true; $title.Location = New-Object System.Drawing.Point(74, 8)
$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Host Claude Code here, drive it from your phone."; $sub.AutoSize = $true; $sub.ForeColor = $cBone; $sub.Location = New-Object System.Drawing.Point(76, 46)
$header.Controls.AddRange(@($pic, $title, $sub))
Add-Row $header 0

# token
New-Section "AUTH TOKEN"
$cbGen = New-Object System.Windows.Forms.CheckBox
$cbGen.Text = "Generate a strong token for me"; $cbGen.Checked = $true; $cbGen.AutoSize = $true; $cbGen.ForeColor = $cBone
Add-Row $cbGen 6
$tbToken = New-Object System.Windows.Forms.TextBox
Style-Text $tbToken; $tbToken.Enabled = $false; try { $tbToken.PlaceholderText = "...or paste your own token" } catch {}
Add-Row $tbToken 8
$cbGen.add_CheckedChanged({ $tbToken.Enabled = -not $cbGen.Checked })

# code folder (textbox + Browse share an auto-sized row panel)
New-Section "YOUR CODE"
New-Caption "Folder that holds your repos (the cave picker):" | Out-Null
$dirRow = New-Object System.Windows.Forms.Panel
$dirRow.AutoSize = $true; $dirRow.AutoSizeMode = "GrowAndShrink"; $dirRow.MinimumSize = New-Object System.Drawing.Size($INNER, 30)
$tbDir = New-Object System.Windows.Forms.TextBox
$def = Join-Path $env:USERPROFILE ".code"; if (-not (Test-Path $def)) { $def = $env:USERPROFILE }
$tbDir.Text = $def; $tbDir.BackColor = $cPanel; $tbDir.ForeColor = $cBone; $tbDir.BorderStyle = "FixedSingle"; $tbDir.Width = ($INNER - 128); $tbDir.Location = New-Object System.Drawing.Point(0, 4)
$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = "Browse..."; $btnBrowse.AutoSize = $true; $btnBrowse.MinimumSize = New-Object System.Drawing.Size(116, 30); $btnBrowse.Location = New-Object System.Drawing.Point(($INNER - 116), 0)
$btnBrowse.FlatStyle = "Flat"; $btnBrowse.BackColor = $cRock; $btnBrowse.ForeColor = $cBone; $btnBrowse.FlatAppearance.BorderSize = 0
$btnBrowse.add_Click({ $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq "OK") { $tbDir.Text = $d.SelectedPath } })
$dirRow.Controls.AddRange(@($tbDir, $btnBrowse))
Add-Row $dirRow 6

# access mode (radios in an auto-sized group box)
New-Section "HOW TO REACH IT"
$grp = New-Object System.Windows.Forms.GroupBox
$grp.Text = ""; $grp.ForeColor = $cBone; $grp.AutoSize = $true; $grp.AutoSizeMode = "GrowAndShrink"; $grp.MinimumSize = New-Object System.Drawing.Size($INNER, 0); $grp.Padding = New-Object System.Windows.Forms.Padding(8, 4, 8, 8)
$rflow = New-Object System.Windows.Forms.FlowLayoutPanel
$rflow.FlowDirection = "TopDown"; $rflow.WrapContents = $false; $rflow.AutoSize = $true; $rflow.AutoSizeMode = "GrowAndShrink"; $rflow.Location = New-Object System.Drawing.Point(10, 12)
$rbTail = New-Object System.Windows.Forms.RadioButton; $rbTail.Text = "Phone over Tailscale (recommended)"; $rbTail.ForeColor = $cBone; $rbTail.AutoSize = $true; $rbTail.Checked = $true; $rbTail.Margin = New-Object System.Windows.Forms.Padding(0, 0, 0, 8)
$rbOog = New-Object System.Windows.Forms.RadioButton; $rbOog.Text = "Local on this PC at https://oog.dev"; $rbOog.ForeColor = $cBone; $rbOog.AutoSize = $true; $rbOog.Margin = New-Object System.Windows.Forms.Padding(0, 0, 0, 8)
$rbLocal = New-Object System.Windows.Forms.RadioButton; $rbLocal.Text = "Plain http://localhost (quick test)"; $rbLocal.ForeColor = $cBone; $rbLocal.AutoSize = $true; $rbLocal.Margin = New-Object System.Windows.Forms.Padding(0, 0, 0, 0)
$rflow.Controls.AddRange(@($rbTail, $rbOog, $rbLocal))
$grp.Controls.Add($rflow)
Add-Row $grp 6

$lblHost = New-Caption "Tailnet hostname (auto-detected; edit if blank):"
$tbHost = New-Object System.Windows.Forms.TextBox
Style-Text $tbHost; $tbHost.Text = (Get-TailnetName)
Add-Row $tbHost 6
$toggleHost = { $vis = $rbTail.Checked; $lblHost.Visible = $vis; $tbHost.Visible = $vis }
$rbTail.add_CheckedChanged($toggleHost); $rbOog.add_CheckedChanged($toggleHost); $rbLocal.add_CheckedChanged($toggleHost)

# options
New-Section "OPTIONS"
function New-Check($text, $checked, $top) {
  $cb = New-Object System.Windows.Forms.CheckBox; $cb.Text = $text; $cb.Checked = $checked; $cb.AutoSize = $true; $cb.ForeColor = $cBone
  Add-Row $cb $top; return $cb
}
$cbApprove = New-Check "Phone approvals (Allow/Deny on phone)" $true 6
$cbTray = New-Check "Run in system tray at log on (no terminal)" $true 4
$cbStart = New-Check "Start oog now when setup finishes" $true 4
$cbResume = New-Check "Auto-resume caves on start" $false 4

# set up button
$btnGo = New-Object System.Windows.Forms.Button
$btnGo.Text = "Set up oog"; $btnGo.Size = New-Object System.Drawing.Size($INNER, 44); $btnGo.FlatStyle = "Flat"; $btnGo.BackColor = $cEmber; $btnGo.ForeColor = [System.Drawing.Color]::FromArgb(42, 22, 7); $btnGo.FlatAppearance.BorderSize = 0
$btnGo.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
Add-Row $btnGo 12

# output log
$out = New-Object System.Windows.Forms.TextBox
$out.Multiline = $true; $out.ScrollBars = "Vertical"; $out.ReadOnly = $true; $out.Size = New-Object System.Drawing.Size($INNER, 58)
$out.BackColor = $cPanel; $out.ForeColor = $cBone; $out.BorderStyle = "FixedSingle"; $out.Font = New-Object System.Drawing.Font("Consolas", 9)
Add-Row $out 10

# size the form to the content so it shows everything without scrolling (clamped to the screen)
$form.PerformLayout(); $panel.PerformLayout()
$need = $panel.GetPreferredSize((New-Object System.Drawing.Size(0, 0)))
$wa = [System.Windows.Forms.Screen]::FromControl($form).WorkingArea
$wantH = [Math]::Min($need.Height, $wa.Height - 56)
$form.ClientSize = New-Object System.Drawing.Size(600, $wantH)

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

# if DPI scaling makes the window taller than the screen, cap to the work area (AutoScroll covers the rest)
$form.add_Shown({
  $wa = [System.Windows.Forms.Screen]::FromControl($form).WorkingArea
  if ($form.Height -gt $wa.Height) { $form.Height = $wa.Height }
  if ($form.Top -lt $wa.Top) { $form.Top = $wa.Top }
})
if ($env:OOG_GUI_NOSHOW -ne "1") { [void]$form.ShowDialog() }
