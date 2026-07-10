@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
cd /d "%ROOT%"

title Dumper Desktop Apps - Launcher

echo.
echo  ============================================================
echo   START HERE - Desktop apps for Dumper's Repo
echo   Folder: %ROOT%
echo  ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python is not installed or not on PATH.
    echo Install from https://www.python.org/downloads/ and check "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%scripts\rock-scan-ocr\sc-toolbox.path" (
    echo [ERROR] Missing scripts\rock-scan-ocr\sc-toolbox.path
    echo.
    echo   1. Copy scripts\rock-scan-ocr\sc-toolbox.path.example
    echo      to scripts\rock-scan-ocr\sc-toolbox.path
    echo   2. Edit it - one line pointing at your SC Toolbox Mining_Signals folder
    echo      Example: C:\...\SC-Toolbox-Beta-V2\tools\Mining_Signals
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%scripts\bp-dumper-py\lookup.json" (
    where node >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Node is required once to build BP Dumper lookup.json.
        echo Install Node 22+ from https://nodejs.org/ then run START-HERE.bat again.
        pause
        exit /b 1
    )
    if not exist "%ROOT%node_modules\" (
        echo [setup] Installing node deps for lookup copy - first time only...
        call npm install
    )
    echo [setup] Copying blueprint lookup for BP Dumper...
    call npm run copy-blueprint-lookup
    if errorlevel 1 (
        echo [ERROR] Could not create scripts\bp-dumper-py\lookup.json
        pause
        exit /b 1
    )
    echo.
)

echo [setup] Checking Python dependencies...
python -m pip install -r "%ROOT%scripts\bp-dumper-py\requirements.txt" -q 2>nul
python -m pip install -r "%ROOT%scripts\rock-scan-ocr\requirements.txt" -q 2>nul
if not exist "%ROOT%scripts\rock-scan-ocr\assets\tray.ico" (
    python "%ROOT%scripts\rock-scan-ocr\build_tray_icon.py" >nul 2>nul
)
echo.

echo Starting BP Dumper + rock-scan tray...
start "BP Dumper + Rock Scan Tray" cmd /k "cd /d "%ROOT%scripts\bp-dumper-py" && title BP Dumper + Rock Scan Tray && python dumper.py --watch"

echo.
echo  ============================================================
echo   RUNNING
echo  ============================================================
echo.
echo   One window: BP Dumper + Rock Scan Tray
echo     - Tails your Game.log
echo     - DR tray icon by the Windows clock ^(port 38471^)
echo.
echo   Website: https://dumpers-repo.com  ^(live site - NOT localhost^)
echo     - Sign in, Mining - Rock Calculator - OCR
echo     - No npm run dev needed
echo.
echo   FIRST TIME ONLY ^(or new resolution^):
echo     Right-click DR tray - Calibrate RESULTS panel
echo.
echo   In-game: Mole pilot, rock scanned, RESULTS panel open
echo.
echo   Tray only ^(no log watch^): double-click RESTART-TRAY.vbs
echo   Tray quit? Same file brings it back.
echo.
pause
