@echo off
cd /d "%~dp0"
set KORETS_NETWORK=1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\launch.ps1"
if errorlevel 1 pause
