@echo off
setlocal enabledelayedexpansion
title Civic Smart - PostgreSQL Database Setup
color 0B

echo ============================================================================
echo   CIVIC SMART - POSTGRESQL DATABASE SETUP WIZARD (DEHRADUN MUNICIPALITY)
echo ============================================================================
echo.

:: 1. Search for psql.exe
set "PSQL_CMD=psql"
where psql >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Found 'psql' in System PATH.
    goto FIND_PORT
)

:: Check common PostgreSQL installation directories
for %%V in (18 17 16 15 14 13) do (
    if exist "C:\Program Files\PostgreSQL\%%V\bin\psql.exe" (
        set "PSQL_CMD=C:\Program Files\PostgreSQL\%%V\bin\psql.exe"
        echo [INFO] Found PostgreSQL %%V at "!PSQL_CMD!"
        goto FIND_PORT
    )
)

echo [WARNING] psql.exe was not detected in PATH or standard Program Files.
echo Please enter the full path to psql.exe or press Enter if available in PATH:
set /p USER_PSQL="Path [or psql]: "
if not "!USER_PSQL!"=="" set "PSQL_CMD=!USER_PSQL!"

:FIND_PORT
echo.
echo Please enter your PostgreSQL connection details (Press ENTER for defaults):
set /p PGHOST="Host [localhost]: "
if "!PGHOST!"=="" set "PGHOST=localhost"

set /p PGPORT="Port [5432]: "
if "!PGPORT!"=="" set "PGPORT=5432"

set /p PGUSER="Username [postgres]: "
if "!PGUSER!"=="" set "PGUSER=postgres"

set /p PGPASSWORD="Password for !PGUSER!: "

set "DBNAME=civic_smartdb"

echo.
echo ============================================================================
echo [STEP 1/3] Creating database '!DBNAME!' if it does not already exist...
echo ============================================================================
"!PSQL_CMD!" -h !PGHOST! -p !PGPORT! -U !PGUSER! -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '!DBNAME!'" | findstr "1" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Database '!DBNAME!' not found. Creating now...
    "!PSQL_CMD!" -h !PGHOST! -p !PGPORT! -U !PGUSER! -d postgres -c "CREATE DATABASE !DBNAME!;"
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Database '!DBNAME!' created successfully.
    ) else (
        echo [ERROR] Failed to create database. Please check your credentials or password.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Database '!DBNAME!' already exists.
)

echo.
echo ============================================================================
echo [STEP 2/3] Executing schema.sql (Tables, Constraints, Triggers, Views)...
echo ============================================================================
"!PSQL_CMD!" -h !PGHOST! -p !PGPORT! -U !PGUSER! -d !DBNAME! -f "database\schema.sql"
if %ERRORLEVEL% EQU 0 (
    echo [OK] Schema applied successfully.
) else (
    echo [ERROR] Failed to apply schema.
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo [STEP 3/3] Executing seed_data.sql (Citizens, Complaints, Officers)...
echo ============================================================================
"!PSQL_CMD!" -h !PGHOST! -p !PGPORT! -U !PGUSER! -d !DBNAME! -f "database\seed_data.sql"
if %ERRORLEVEL% EQU 0 (
    echo [OK] Seed data inserted successfully.
) else (
    echo [ERROR] Failed to insert seed data.
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo  SUCCESS! PostgreSQL database for Civic Smart is completely configured.
echo ============================================================================
echo Database: !DBNAME!
echo Host:     !PGHOST!:!PGPORT!
echo User:     !PGUSER!
echo.
echo Next steps:
echo 1. In 'backend/.env', set PGPASSWORD=!PGPASSWORD!
echo 2. Start the backend:
echo      Option A (Node.js): cd backend ^&^& npm install ^&^& npm start
echo      Option B (Python):  cd backend\python ^&^& pip install -r requirements.txt ^&^& python app.py
echo 3. Open index.html in your browser.
echo ============================================================================
echo.
pause
