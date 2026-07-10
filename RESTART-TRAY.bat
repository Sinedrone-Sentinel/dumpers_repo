@echo off
setlocal
set "ROOT=%~dp0"
set "TRAY_DIR=%ROOT%scripts\rock-scan-ocr"
cd /d "%TRAY_DIR%"

where pythonw >nul 2>nul
if errorlevel 1 (
    echo [ERROR] pythonw not found. Reinstall Python and check "Add Python to PATH".
    timeout /t 6 >nul
    exit /b 1
)

powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:38471/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }" | findstr /i "True" >nul
if not errorlevel 1 exit /b 0

start "" pythonw "%TRAY_DIR%\tray_app.py"
exit /b 0
