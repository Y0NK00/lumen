@echo off
REM Run from "x64 Native Tools Command Prompt for VS 2022" (Start menu) — NOT plain PowerShell.
REM In PowerShell you can still run:  .\install-pyaudio-windows.cmd  (note the .\ prefix)
REM Prepend vcpkg PortAudio headers/libs so PyAudio can compile (needed on Python 3.13+).

setlocal EnableDelayedExpansion

if "%VCPKG_ROOT%"=="" set "VCPKG_ROOT=C:\Dev\vcpkg"
set "PREFIX=%VCPKG_ROOT%\installed\x64-windows"

if not exist "%PREFIX%\include\portaudio.h" (
  echo ERROR: portaudio.h not found at:
  echo   %PREFIX%\include\portaudio.h
  echo Install PortAudio first:
  echo   cd "%VCPKG_ROOT%"
  echo   .\vcpkg install portaudio:x64-windows
  exit /b 1
)

set "INCLUDE=%PREFIX%\include;%INCLUDE%"
set "LIB=%PREFIX%\lib;%LIB%"

echo VCPKG_ROOT=%VCPKG_ROOT%
echo.
cd /d "%~dp0"
python -m pip install --upgrade pip setuptools wheel
python -m pip install pyaudio
python -c "import pyaudio; print('PyAudio OK:', pyaudio.__version__)"
if errorlevel 1 exit /b 1
echo.
echo Done. Restart: python lumen-jarvis.py
