@echo off
title Lumen — Installer
echo.
echo  ============================================
echo    Lumen — Local AI Desktop App
echo  ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [!] Node.js is not installed.
    echo.
    echo  Please install it from: https://nodejs.org
    echo  Download the LTS version ^(Windows installer^)
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo  [OK] Node.js found: %NODE_VER%
echo.

:: Install dependencies
echo  Installing dependencies...
call npm install --save-dev electron@28 electron-builder@24
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [!] npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo.
echo  [OK] Dependencies installed.
echo.

:: Ask user what they want to do
echo  What would you like to do?
echo.
echo   [1] Launch Lumen now (development mode)
echo   [2] Build a Windows installer (.exe)
echo.
set /p CHOICE=" Enter 1 or 2: "

if "%CHOICE%"=="1" (
    echo.
    echo  Launching Lumen...
    call npm start
) else if "%CHOICE%"=="2" (
    echo.
    echo  Building Windows installer... (this takes 1-3 minutes)
    call npm run build
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo  ============================================
        echo   Build complete!
        echo   Installer is in: dist\
        echo  ============================================
        explorer dist
    ) else (
        echo  [!] Build failed. Check the error above.
    )
    pause
) else (
    echo  Invalid choice. Run install.bat again.
    pause
)
