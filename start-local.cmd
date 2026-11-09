@echo off
cd /d "%~dp0"
set "HOST=127.0.0.1"
set "PORT=3001"
set "BROWSER=none"
echo Starting What2Ban 2.0 at http://127.0.0.1:3001
echo Keep this window open while using the app. Press Ctrl+C to stop.
call npm.cmd start
pause
