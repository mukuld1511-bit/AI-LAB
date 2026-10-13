@echo off
setlocal enabledelayedexpansion
title AI/ML Lab PC — 24/7 Setup Installer

echo =====================================================================
echo       AI/ML LAB 24/7 ATTENDANCE & PC SYSTEM — ONE-CLICK SETUP
echo       In-Charge: Prof. Richa Choudhary  ^|  Target: Local Lab PC
echo =====================================================================
echo.

cd /d "%~dp0"

:: 1. Check Python
echo [1/6] Checking Python installation...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in system PATH!
    echo Please install Python 3.10 or 3.11 from: https://www.python.org/downloads/
    echo NOTE: Ensure you check the box "Add Python to PATH" during installation.
    pause
    exit /b 1
)
python --version

:: 2. Create Virtual Environment
echo.
echo [2/6] Setting up Python Virtual Environment (venv)...
if not exist "venv\Scripts\python.exe" (
    echo Creating virtual environment in venv\...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo Virtual environment created successfully.
) else (
    echo Virtual environment already exists.
)

:: 3. Upgrade pip and install requirements
echo.
echo [3/6] Installing dependencies from requirements.txt...
call venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] If dlib or face_recognition failed to install,
    echo install CMake and Visual Studio C++ Build Tools or run precompiled wheel.
    echo Continuing setup...
)

:: 4. Check ngrok
echo.
echo [4/6] Checking ngrok installation...
where ngrok >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] ngrok CLI not found in PATH.
    echo Please download ngrok from https://ngrok.com/download
    echo Place ngrok.exe in C:\Windows\System32 or add its folder to PATH.
) else (
    echo ngrok detected:
    ngrok version
)

:: 5. Initialize Database & Run Migrations
echo.
echo [5/6] Initializing SQLite database and table migrations...
python -c "import sys; sys.path.append('backend'); import database; database.init_db(); print('[SUCCESS] Database initialized successfully.')"

:: 6. Setup Complete
echo.
echo =====================================================================
echo                      SETUP COMPLETED SUCCESSFULLY!
echo =====================================================================
echo.
echo Next Steps for 24/7 Deployment on this Lab PC:
echo.
echo 1. To start the system manually right now:
echo    Double-click:  run_24_7.bat
echo.
echo 2. To make it AUTO-START on Windows boot (24/7 uninterrupted):
echo    Right-click on: install_startup_task.bat  -^> "Run as Administrator"
echo.
echo 3. Permanent Cloud Access URL:
echo    https://amaretto-confess-subtract.ngrok-free.dev
echo.
echo 4. Local LAN URL:
echo    http://localhost:8000
echo.
echo =====================================================================
pause
