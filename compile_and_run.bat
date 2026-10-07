@echo off
title Civic Smart - OS Scheduling Engine
echo ========================================================
echo  CIVIC SMART - COMPILING OS SCHEDULING ENGINE (C++)
echo  Team: City Solvers | Member Focus: Gurudutt (OS Engine)
echo ========================================================
echo.

g++ -std=c++11 civic_os_engine.cpp -o civic_os_engine.exe

if %ERRORLEVEL% EQU 0 (
    echo [OK] Compilation successful!
    echo [OK] Launching Civic Smart OS Simulation Console...
    echo.
    .\civic_os_engine.exe
) else (
    echo [ERROR] Compilation failed. Please check your g++ compiler.
)

pause
