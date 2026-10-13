@echo off
title AI Lab Telemetry Agent - PC-3
color 0b
echo ===================================================================
echo   AI LAB WORKSTATION TELEMETRY AGENT - PC-3
echo ===================================================================
echo.
cd /d "%~dp0"

python pc_telemetry_agent.py PC-3
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Python failed to start. Running fallback with python3...
    python3 pc_telemetry_agent.py PC-3
)
pause
