@echo off
title PIET AIML Dept. - Lab 414 Agent Installer
color 0b
echo ===================================================================
echo   PIET AIML DEPARTMENT - LAB 414 WORKSTATION AUTO-STARTUP SETUP
echo ===================================================================
echo.

cd /d "%~dp0"

:: 1. Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python 3 is not installed or not in PATH!
    echo Please install Python 3 from https://www.python.org/
    pause
    exit /b 1
)

:: 2. Determine PC Identifier
set PC_NUM=%1
if "%PC_NUM%"=="" (
    set /p PC_NUM="Enter PC Number in Lab 414 (e.g. 01, 05, 12, 28): "
)

if "%PC_NUM%"=="" set PC_NUM=01

:: Format as PC-414-XX
set TARGET_PC=PC-414-%PC_NUM%
if "%PC_NUM:~0,6%"=="PC-414" (
    set TARGET_PC=%PC_NUM%
)

echo.
echo [Target Identifier: %TARGET_PC%]
echo [Target Lab       : LAB-414 (AI & Deep Learning Lab)]
echo.

:: 3. Generate Local Config JSON
(
echo {
echo     "pc_id": "%TARGET_PC%",
echo     "lab_id": "LAB-414",
echo     "hub_url": "https://raspberrypi.tailc8c1f6.ts.net",
echo     "heartbeat_interval": 6,
echo     "idle_threshold_seconds": 180
echo }
) > "%~dp0agent_config.json"

echo [1/3] Configured %TARGET_PC% successfully.

:: 4. Install Dependencies
echo [2/3] Installing lightweight dependencies (psutil, pillow)...
python -m pip install --quiet psutil pillow >nul 2>&1

:: 5. Download Agent Script if not present
if not exist "%~dp0lab_414_agent.py" (
    echo [Fetching lab_414_agent.py...]
    curl -sSL "https://raspberrypi.tailc8c1f6.ts.net/static/agent/lab_414_agent.py" -o "%~dp0lab_414_agent.py" 2>nul || curl -sSL "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/lab_414_agent.py" -o "%~dp0lab_414_agent.py"
)

:: 6. Register Task Scheduler for Silent Auto-Startup
echo [3/3] Registering Windows Auto-Startup Task...
set SCRIPT_PATH=%~dp0lab_414_agent.py

schtasks /delete /tn "PIET_Lab414_Agent" /f >nul 2>&1
schtasks /create /tn "PIET_Lab414_Agent" /tr "pythonw.exe \"%SCRIPT_PATH%\" %TARGET_PC%" /sc onlogon /rl highest /f >nul 2>&1

if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo   ✅ SUCCESS! Agent installed as Permanent Background Startup Task.
    echo   It will now start automatically whenever this PC powers ON.
    echo ===================================================================
) else (
    echo [INFO] Falling back to User Startup Folder...
    set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
    echo @start pythonw.exe "%SCRIPT_PATH%" %TARGET_PC% > "%STARTUP_FOLDER%\run_piet_agent.bat"
    echo [SUCCESS] Shortcut added to Startup Folder.
)

echo.
echo Launching agent now for immediate live connection...
start pythonw.exe "%SCRIPT_PATH%" %TARGET_PC%
echo 🟢 %TARGET_PC% is now LIVE and streaming to Lab 414 Hub!
timeout /t 3 >nul
exit /b 0
