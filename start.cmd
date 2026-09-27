@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org/
  pause
  exit /b 1
)
echo Manxiang Studio: http://127.0.0.1:3000
echo Keep this window open. Press Ctrl+C to stop.
node server.mjs
if errorlevel 1 pause
