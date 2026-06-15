@echo off
REM oog.dev — double-click to open the clickable setup wizard (Windows).
REM Prefer the terminal? run:  npm run setup
powershell -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0scripts\oog-setup-gui.ps1"
