@echo off
title Civic Smart - Backend Server
color 0A

echo ============================================================================
echo   CIVIC SMART - REST API BACKEND LAUNCHER
echo ============================================================================
echo.

:: 1. Add PostgreSQL bin to PATH for libpq DLLs
set "PATH=C:\Program Files\PostgreSQL\18\bin;%PATH%"

:: 2. Search for Python
set "PYTHON_CMD="
if exist "C:\Program Files\PostgreSQL\18\pgAdmin 4\python\python.exe" (
    set "PYTHON_CMD=C:\Program Files\PostgreSQL\18\pgAdmin 4\python\python.exe"
    echo [INFO] Using PostgreSQL Python: "!PYTHON_CMD!"
) else (
    where python >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        set "PYTHON_CMD=python"
        echo [INFO] Using System Python.
    )
)

if not "%PYTHON_CMD%"=="" (
    echo [INFO] Launching Python REST API backend...
    cd /d "%~dp0backend"
    "%PYTHON_CMD%" app.py
    goto END
)

:: 3. Fallback to Node.js
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Launching Node.js Express backend...
    cd /d "%~dp0backend"
    node server.js
    goto END
)

echo [ERROR] Neither Python nor Node.js was found.
echo Please install Node.js or Python to run the backend server.
pause

:END
