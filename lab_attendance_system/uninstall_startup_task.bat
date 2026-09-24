@echo off
title Remove 24/7 Windows Startup Task
cd /d "%~dp0"

echo =====================================================================
echo       REMOVE 24/7 WINDOWS AUTO-START SERVICE
echo =====================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Administrator privileges are required.
    echo Please right-click this file and select "Run as administrator".
    pause
    exit /b 1
)

set TASK_NAME=AILabAttendance24_7
schtasks /delete /tn "%TASK_NAME%" /f

if %errorlevel% equ 0 (
    echo [SUCCESS] Scheduled task "%TASK_NAME%" removed successfully.
) else (
    echo [INFO] Task not found or already removed.
)

echo.
pause
