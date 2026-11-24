@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24.15 or newer before starting this application.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run db:setup
if errorlevel 1 (
  echo Start Docker Desktop and check network access, then run this file again.
  pause
  exit /b 1
)
echo Read SETUP_TOKEN from your private .env file to create the first owner.
call npm run dev
pause
