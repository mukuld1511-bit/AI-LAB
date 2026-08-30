@echo off
title AI/ML Lab - One-Click Launcher
echo ============================================================
echo    AI/ML LAB ATTENDANCE SYSTEM - ONE-CLICK LAUNCHER
echo    Richa Mam's Lab
echo ============================================================
echo.

:: Change to project directory
cd /d "%~dp0"

:: Start FastAPI Backend in new window
echo [1/3] Starting FastAPI Backend on port 8000...
start "Lab Backend" cmd /k "cd backend && python main.py"
timeout /t 3 /nobreak > nul

:: Start ngrok tunnel + auto-copy URL to clipboard
echo [2/3] Starting ngrok tunnel...
start "ngrok Tunnel" cmd /k "python auto_tunnel.py"
timeout /t 2 /nobreak > nul

:: Start Face Recognition Camera in new window
echo [3/3] Starting Face Recognition Camera...
start "Lab Camera" cmd /k "python face_recognition_module\recognizer.py"

echo.
echo ============================================================
echo    ALL 3 SYSTEMS LAUNCHED!
echo ============================================================
echo.
echo    Backend:  http://localhost:8000
echo    ngrok:    Check "ngrok Tunnel" window - URL auto-copied!
echo    Camera:   Check "Lab Camera" window for webcam feed
echo.
echo    The ngrok URL is auto-copied to your clipboard.
echo    Open your Vercel dashboard, click Settings, and Ctrl+V.
echo.
pause
