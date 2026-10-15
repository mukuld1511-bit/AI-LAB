@echo off
title PIET Department Central Master Server (5 Labs Supervision Hub)
color 0A
echo =====================================================================
echo  PIET AIML DEPARTMENT - CENTRAL MASTER SERVER (100 PCS / 5 LABS)
echo =====================================================================
echo.
echo Initializing environment...

cd /d "%~dp0"

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in system PATH!
    echo Please install Python 3.10+ from python.org and add to PATH.
    pause
    exit /b 1
)

REM Check or Create Virtual Environment
if not exist "venv\Scripts\python.exe" (
    echo Creating virtual environment (venv)...
    python -m venv venv
    echo Installing dependencies from requirements.txt...
    venv\Scripts\pip.exe install -r requirements.txt
)

echo Starting PIET Central Master Server on port 8080...
echo Web Portal will be available at: http://localhost:8080
echo.
venv\Scripts\python.exe server.py
pause
