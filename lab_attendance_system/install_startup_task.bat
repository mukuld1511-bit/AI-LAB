@echo off
title Install 24/7 Windows Startup Task
cd /d "%~dp0"

echo =====================================================================
echo       INSTALL 24/7 WINDOWS AUTO-START SERVICE (TASK SCHEDULER)
echo =====================================================================
echo.
echo This registers an automated Windows Scheduled Task named "AILabAttendance24_7"
echo so the system boots immediately when the Lab PC powers on (after power cuts/restarts).
echo.

:: Check Admin privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Administrator privileges are required to register a system boot task.
    echo Please right-click this file and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

set TASK_NAME=AILabAttendance24_7
set BATCH_PATH=%~dp0run_24_7.bat

echo Registering Task '%TASK_NAME%' to execute on system startup...
schtasks /create /tn "%TASK_NAME%" /tr "\"%BATCH_PATH%\"" /sc ONSTART /ru "SYSTEM" /rl HIGHEST /f

if %errorlevel% equ 0 (
    echo.
    echo =====================================================================
    echo  [SUCCESS] 24/7 TASK REGISTERED SUCCESSFULLY!
    echo =====================================================================
    echo The system will now launch automatically in the background on every PC boot.
    echo.
    echo To verify the task:
    echo   schtasks /query /tn "%TASK_NAME%"
    echo.
    echo To start the task right now without rebooting:
    echo   schtasks /run /tn "%TASK_NAME%"
    echo =====================================================================
) else (
    echo.
    echo [WARNING] System-level task failed. Creating user logon task instead...
    schtasks /create /tn "%TASK_NAME%" /tr "\"%BATCH_PATH%\"" /sc ONLOGON /rl HIGHEST /f
    if %errorlevel% equ 0 (
        echo [SUCCESS] User logon auto-start task registered.
    ) else (
        echo [ERROR] Could not register scheduled task.
    )
)

echo.
pause
