@echo off
setlocal
set "ROOT=%~dp0"
set "TRAY_DIR=%ROOT%scripts\rock-scan-ocr"
cd /d "%TRAY_DIR%"

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python is not installed or not on PATH.
    timeout /t 6 >nul
    exit /b 1
)

echo Restarting rock-scan tray ^(stops old bridge, starts fresh code^)...
python "%TRAY_DIR%\restart_tray.py"
if errorlevel 1 (
    echo [ERROR] Tray restart failed. Log: %TEMP%\dumper-rock-scan-restart.log
    timeout /t 8 >nul
    exit /b 1
)

echo Tray is up on http://127.0.0.1:38471
timeout /t 2 >nul
exit /b 0
