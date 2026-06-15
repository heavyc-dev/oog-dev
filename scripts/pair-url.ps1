# pair-url.ps1 - print the pairing URL the tray QR encodes (reads .env). Diagnostic helper.
$root = Split-Path -Parent $PSScriptRoot
$m = @{}
foreach ($l in Get-Content (Join-Path $root ".env")) {
  if ($l -match '^\s*([^#=][^=]*)=(.*)$') { $m[$matches[1].Trim()] = $matches[2].Trim().Trim('"') }
}
$u = $m["OOG_URL"]; $t = $m["AUTH_TOKEN"]
Write-Host ("OOG_URL    : " + $(if ($u) { $u } else { "<MISSING>" }))
Write-Host ("AUTH_TOKEN : " + $(if ($t) { "set (len " + $t.Length + ")" } else { "<MISSING>" }))
Write-Host ("PAIR URL   : " + $u + "/?token=" + $t)
