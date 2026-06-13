@echo off
REM Fix "service started and then stopped" - run as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Run this file as Administrator!
    pause
    exit /b 1
)
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0fix-service.ps1"
