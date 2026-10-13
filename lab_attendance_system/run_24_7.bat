@echo off
title AI/ML Lab 24/7 Service Runner
cd /d "%~dp0"

echo =====================================================================
echo       AI/ML LAB 24/7 ATTENDANCE & PC SYSTEM — SERVICE RUNNER
echo       In-Charge: Prof. Richa Choudhary
echo =====================================================================
echo.
echo Starting 24/7 Watchdog Supervisor...
echo Permanent ngrok Domain: https://amaretto-confess-subtract.ngrok-free.dev
echo Localhost Server      : http://localhost:8000
echo.
echo Logs are saved to: %~dp0logs\
echo.
echo (Do not close this window if running in foreground. Press Ctrl+C to stop.)
echo.

if exist "venv\Scripts\python.exe" (
    venv\Scripts\python.exe watchdog_24_7.py
) else (
    python watchdog_24_7.py
)

pause
