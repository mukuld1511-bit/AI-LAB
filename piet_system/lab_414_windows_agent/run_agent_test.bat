@echo off
title Lab 414 Agent Interactive Console Test
cd /d "%~dp0"
echo ===================================================================
echo   LAB 414 AGENT - CONSOLE TEST MODE
echo ===================================================================
echo.
python lab_414_agent.py %*
pause
