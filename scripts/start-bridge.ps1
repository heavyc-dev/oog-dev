# start-bridge.ps1 — launch the oog.dev bridge. Config is read from .env (run: npm run setup).
# Point Task Scheduler at this for "always on", or run it directly.
Set-Location (Join-Path $PSScriptRoot "..")
npm start
