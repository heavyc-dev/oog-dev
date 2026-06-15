# oog-setup-gui.ps1 - clickable setup wizard. Collects choices in a window, then runs the
# existing setup.mjs non-interactively (OOG_NI=1 + OOG_* answers) so the logic is never forked.
# Launch via oog-setup.cmd (double-click) or: powershell -STA -ExecutionPolicy Bypass -File scripts\oog-setup-gui.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
# resolve the repo root robustly ($PSScriptRoot can be empty depending on how the script is launched)
$self = $PSCommandPath
if (-not $self -and $MyInvocation.MyCommand.Path) { $self = $MyInvocation.MyCommand.Path }
if ($self) { $root = Split-Path -Parent (Split-Path -Parent $self) }
elseif ($PSScriptRoot) { $root = Split-Path -Parent $PSScriptRoot }
else { $root = (Get-Location).Path }
if (-not (Test-Path (Join-Path $root "setup.mjs"))) {
  [System.Windows.Forms.MessageBox]::Show("Couldn't find setup.mjs. Run this from the oog repo (double-click oog-setup.cmd in the repo folder).", "oog.dev setup", "OK", "Error") | Out-Null
  return
}
$script:root = $root  # share with event handlers (click/timer run in their own scope)

function Get-TailnetName {
  try { $j = (& tailscale status --json | Out-String | ConvertFrom-Json); return ($j.Self.DNSName -replace '\.$', '') } catch { return "" }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "oog.dev setup"
$form.Size = New-Object System.Drawing.Size(560, 640)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$ico = Join-Path $root "public\assets\oog.ico"
if (Test-Path $ico) { try { $form.Icon = New-Object System.Drawing.Icon($ico) } catch {} }

$y = 14
function Add-Label($text, $bold) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text; $l.AutoSize = $true; $l.Location = New-Object System.Drawing.Point(16, $script:y)
  if ($bold) { $l.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold) }
  $form.Controls.Add($l); $script:y += 24; return $l
}

Add-Label "oog.dev - host Claude Code, drive it from your phone" $true | Out-Null

# token
$cbGen = New-Object System.Windows.Forms.CheckBox
$cbGen.Text = "Generate a strong token for me"; $cbGen.Checked = $true; $cbGen.AutoSize = $true
$cbGen.Location = New-Object System.Drawing.Point(16, $y); $form.Controls.Add($cbGen); $y += 26
$tbToken = New-Object System.Windows.Forms.TextBox
$tbToken.Location = New-Object System.Drawing.Point(16, $y); $tbToken.Size = New-Object System.Drawing.Size(500, 22)
$tbToken.Enabled = $false; try { $tbToken.PlaceholderText = "...or paste your own token" } catch {}
$form.Controls.Add($tbToken); $y += 34
$cbGen.add_CheckedChanged({ $tbToken.Enabled = -not $cbGen.Checked })

# code folder
Add-Label "Folder that holds your repos (the cave picker):" | Out-Null
$tbDir = New-Object System.Windows.Forms.TextBox
$def = Join-Path $env:USERPROFILE ".code"; if (-not (Test-Path $def)) { $def = $env:USERPROFILE }
$tbDir.Text = $def; $tbDir.Location = New-Object System.Drawing.Point(16, $y); $tbDir.Size = New-Object System.Drawing.Size(410, 22)
$form.Controls.Add($tbDir)
$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = "Browse..."; $btnBrowse.Location = New-Object System.Drawing.Point(432, ($y - 1)); $btnBrowse.Size = New-Object System.Drawing.Size(84, 24)
$btnBrowse.add_Click({ $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq "OK") { $tbDir.Text = $d.SelectedPath } })
$form.Controls.Add($btnBrowse); $y += 36

# access mode
$grp = New-Object System.Windows.Forms.GroupBox
$grp.Text = "How will you reach it?"; $grp.Location = New-Object System.Drawing.Point(16, $y); $grp.Size = New-Object System.Drawing.Size(500, 96)
$rbTail = New-Object System.Windows.Forms.RadioButton; $rbTail.Text = "Phone over Tailscale (recommended)"; $rbTail.Location = New-Object System.Drawing.Point(12, 20); $rbTail.AutoSize = $true; $rbTail.Checked = $true
$rbOog = New-Object System.Windows.Forms.RadioButton; $rbOog.Text = "Local on this PC at https://oog.dev"; $rbOog.Location = New-Object System.Drawing.Point(12, 44); $rbOog.AutoSize = $true
$rbLocal = New-Object System.Windows.Forms.RadioButton; $rbLocal.Text = "Plain http://localhost (quick test)"; $rbLocal.Location = New-Object System.Drawing.Point(12, 68); $rbLocal.AutoSize = $true
$grp.Controls.AddRange(@($rbTail, $rbOog, $rbLocal)); $form.Controls.Add($grp); $y += 104

# tailnet hostname
$lblHost = Add-Label "Tailnet hostname (auto-detected; edit if blank):"
$tbHost = New-Object System.Windows.Forms.TextBox
$tbHost.Location = New-Object System.Drawing.Point(16, $y); $tbHost.Size = New-Object System.Drawing.Size(500, 22)
$tbHost.Text = (Get-TailnetName)
$form.Controls.Add($tbHost); $y += 36
$toggleHost = { $vis = $rbTail.Checked; $lblHost.Visible = $vis; $tbHost.Visible = $vis }
$rbTail.add_CheckedChanged($toggleHost); $rbOog.add_CheckedChanged($toggleHost); $rbLocal.add_CheckedChanged($toggleHost)

# options
$cbApprove = New-Object System.Windows.Forms.CheckBox; $cbApprove.Text = "Phone approvals (Allow/Deny on phone)"; $cbApprove.Checked = $true; $cbApprove.AutoSize = $true; $cbApprove.Location = New-Object System.Drawing.Point(16, $y); $form.Controls.Add($cbApprove); $y += 24
$cbTray = New-Object System.Windows.Forms.CheckBox; $cbTray.Text = "Run in system tray at log on (no terminal)"; $cbTray.Checked = $true; $cbTray.AutoSize = $true; $cbTray.Location = New-Object System.Drawing.Point(16, $y); $form.Controls.Add($cbTray); $y += 24
$cbResume = New-Object System.Windows.Forms.CheckBox; $cbResume.Text = "Auto-resume caves on start"; $cbResume.AutoSize = $true; $cbResume.Location = New-Object System.Drawing.Point(16, $y); $form.Controls.Add($cbResume); $y += 32

# set up button + output
$btnGo = New-Object System.Windows.Forms.Button
$btnGo.Text = "Set up oog"; $btnGo.Location = New-Object System.Drawing.Point(16, $y); $btnGo.Size = New-Object System.Drawing.Size(500, 34)
$btnGo.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($btnGo); $y += 42
$out = New-Object System.Windows.Forms.TextBox
$out.Multiline = $true; $out.ScrollBars = "Vertical"; $out.ReadOnly = $true
$out.Location = New-Object System.Drawing.Point(16, $y); $out.Size = New-Object System.Drawing.Size(500, 120)
$out.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($out)

# strip ANSI colour codes from captured wizard output
function Strip-Ansi($s) { return ($s -replace "\x1b\[[0-9;]*m", "") }

function b01($c) { if ($c) { "1" } else { "0" } }
$btnGo.add_Click({
  $btnGo.Enabled = $false
  $out.Text = "Setting up..." + [Environment]::NewLine
  $mode = "1"
  if ($rbOog.Checked) { $mode = "0" }
  elseif ($rbLocal.Checked) { $mode = "2" }
  # $script: scope so the timer tick (runs after this handler returns) can still see them
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
      $script:timer.Stop(); $btnGo.Enabled = $true
      $envFile = Join-Path $script:root ".env"; $tok = ""; $url = ""
      if (Test-Path $envFile) { foreach ($l in Get-Content $envFile) { if ($l -match '^AUTH_TOKEN=(.*)$') { $tok = $matches[1].Trim('"') }; if ($l -match '^OOG_URL=(.*)$') { $url = $matches[1].Trim('"') } } }
      $nl = [Environment]::NewLine
      $msg = "Done. Start it from the tray icon (or run: npm start)."
      if ($url) { $msg += $nl + $nl + "Open: " + $url }
      if ($tok) { $msg += $nl + "Token: " + $tok + $nl + $nl + "Tip: npm start prints a QR you can scan on your phone (no typing)."; Set-Clipboard -Value $tok; $msg += $nl + $nl + "(Token copied to clipboard.)" }
      [System.Windows.Forms.MessageBox]::Show($msg, "oog.dev ready", "OK", "Information") | Out-Null
    }
  })
  $script:timer.Start()
})

[void]$form.ShowDialog()
