@echo off
title TaskFlow - Real-Time Task Management
echo ============================================================
echo   Starting TaskFlow Full-Stack Application...
echo ============================================================

REM Find available Node runtime
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set NODE_CMD=node
    goto START_SERVER
)

if exist "%APPDATA%\Antigravity\bin\agy-node.cmd" (
    set "NODE_CMD=%APPDATA%\Antigravity\bin\agy-node.cmd"
    goto START_SERVER
)

echo [ERROR] Node.js was not found in PATH or in Antigravity tools.
echo Please install Node.js from https://nodejs.org or run with agy-node.
pause
exit /b 1

:START_SERVER
echo [OK] Using Node runner: %NODE_CMD%
echo [INFO] Opening default browser at http://localhost:3000 ...
start "" "http://localhost:3000"

echo [INFO] Starting Node.js server...
"%NODE_CMD%" server.js
pause
