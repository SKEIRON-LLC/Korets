@echo off
cd /d "%~dp0"
title Korets Museum PIN setup
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Please contact the museum website administrator.
  pause
  exit /b 1
)
node server\setup-admin.mjs
pause
