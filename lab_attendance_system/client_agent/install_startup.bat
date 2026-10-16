@echo off
title AI LAB Workstation Telemetry Agent Setup
color 0b
echo ===================================================================
echo   AI LAB WORKSTATION TELEMETRY AGENT AUTO-STARTUP INSTALLER
echo   In-Charge: Dr. Richa Choudhary (Assistant Professor)
echo ===================================================================
echo.
cd /d "%~dp0"

echo [1/4] Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in system PATH!
    echo Please install Python 3 from https://www.python.org/
    pause
    exit /b 1
)

:: Prompt for PC number if not passed
set PC_INPUT=%1
if "%PC_INPUT%"=="" (
    set /p PC_INPUT="Enter AI Lab PC Number (1 to 8): "
)
if "%PC_INPUT%"=="" set PC_INPUT=1

:: Normalize to PC-X
set TARGET_PC=PC-%PC_INPUT%
if "%PC_INPUT:~0,3%"=="PC-" set TARGET_PC=%PC_INPUT%
if "%PC_INPUT:~0,2%"=="pc-" set TARGET_PC=%PC_INPUT%

echo.
echo [Target PC ID: %TARGET_PC%]
echo [Backend URL : https://labg418pc12.tailc8c1f6.ts.net]
echo.

(
echo {
echo     "pc_id": "%TARGET_PC%",
echo     "backend_url": "https://labg418pc12.tailc8c1f6.ts.net",
echo     "heartbeat_interval": 6
echo }
) > "%~dp0agent_config.json"
echo [2/4] Saved agent_config.json for %TARGET_PC%.

echo [3/4] Installing lightweight dependencies (psutil, pillow, pynvml)...
python -m pip install --quiet psutil pillow pynvml >nul 2>&1

echo [4/4] Setting up Windows Auto-Startup Task...
set SCRIPT_PATH=%~dp0pc_telemetry_agent.py

schtasks /delete /tn "AILab_PC_TelemetryAgent" /f >nul 2>&1
schtasks /create /tn "AILab_PC_TelemetryAgent" /tr "pythonw.exe \"%SCRIPT_PATH%\" %TARGET_PC%" /sc onlogon /rl highest /f >nul 2>&1

if %errorlevel% equ 0 (
    echo [SUCCESS] Registered Windows Task Scheduler auto-start.
) else (
    echo [INFO] Adding fallback shortcut to User Startup Folder...
    set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
    echo @start pythonw.exe "%SCRIPT_PATH%" %TARGET_PC% > "%STARTUP_FOLDER%\run_ai_lab_agent.bat"
    echo [SUCCESS] Added shortcut to: %STARTUP_FOLDER%\run_ai_lab_agent.bat
)

echo.
echo Launching agent now for immediate connection...
start pythonw.exe "%SCRIPT_PATH%" %TARGET_PC%
echo ===================================================================
echo   GREEN: %TARGET_PC% is now LIVE and streaming to AI Lab Dashboard!
echo ===================================================================
timeout /t 3 >nul
exit /b 0
