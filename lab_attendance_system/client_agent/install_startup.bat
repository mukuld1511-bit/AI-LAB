@echo off
title AI LAB Workstation Telemetry Agent Setup
color 0b
echo ===================================================================
echo   AI LAB WORKSTATION TELEMETRY AGENT AUTO-STARTUP INSTALLER
echo ===================================================================
echo.
cd /d "%~dp0"

echo [1/3] Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in system PATH!
    echo Please install Python 3 from https://www.python.org/
    pause
    exit /b 1
)

echo [2/3] Installing lightweight dependencies (psutil, pynvml)...
python -m pip install --quiet psutil pynvml >nul 2>&1

echo [3/3] Setting up Windows Auto-Startup Task...
set SCRIPT_PATH=%~dp0pc_telemetry_agent.py

:: Register Windows Task Scheduler task that runs silently in background at system startup
schtasks /create /tn "AILab_PC_TelemetryAgent" /tr "pythonw.exe \"%SCRIPT_PATH%\"" /sc onlogon /rl highest /f >nul 2>&1

if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo   SUCCESS! Telemetry Agent successfully installed as Startup Task.
    echo   It will now automatically start whenever this PC turns ON.
    echo ===================================================================
) else (
    :: Fallback: Add to Current User Startup folder
    echo [INFO] Adding shortcut to User Startup Folder as fallback...
    set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
    echo @start pythonw.exe "%SCRIPT_PATH%" > "%STARTUP_FOLDER%\run_ai_lab_agent.bat"
    echo.
    echo [SUCCESS] Added to Startup Folder: %STARTUP_FOLDER%\run_ai_lab_agent.bat
)

echo.
echo Launching agent now for immediate connection...
start pythonw.exe "%SCRIPT_PATH%"
echo Agent is now running in the background!
timeout /t 3 >nul
exit /b 0
