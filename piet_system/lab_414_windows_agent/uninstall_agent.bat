@echo off
title Uninstall Lab 414 Agent
color 0c
echo ===================================================================
echo   UNINSTALLING PIET LAB 414 AGENT
echo ===================================================================
echo.

schtasks /delete /tn "PIET_Lab414_Agent" /f >nul 2>&1
taskkill /f /im pythonw.exe /fi "WINDOWTITLE eq *lab_414_agent*" >nul 2>&1

set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
if exist "%STARTUP_FOLDER%\run_piet_agent.bat" (
    del "%STARTUP_FOLDER%\run_piet_agent.bat" >nul 2>&1
)

echo ✅ Successfully uninstalled Lab 414 Agent task and stopped process.
pause
