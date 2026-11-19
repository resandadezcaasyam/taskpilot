@echo off
rem TaskPilot launcher for Windows: double-click this file to start the app.
rem It installs what is missing on the first run, then starts TaskPilot and opens your browser.
cd /d "%~dp0"
title TaskPilot

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 22 LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing TaskPilot. This can take a few minutes and needs internet...
  call npm install
  if errorlevel 1 (
    echo.
    echo The installation failed. Read the message above, or see the Troubleshooting section of README.md.
    pause
    exit /b 1
  )
)

echo Starting TaskPilot... your browser will open at http://localhost:3000 in a few seconds.
echo Keep this window open while you use TaskPilot. Close it (or press Ctrl+C) to stop.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"
call npm run dev
pause
