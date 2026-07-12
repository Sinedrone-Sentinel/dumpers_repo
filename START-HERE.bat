@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
cd /d "%ROOT%"

title Dumper Apps

echo.
echo  ============================================================
echo   DUMPER APPS - double-click launcher
echo  ============================================================
echo.

call :ensure_python
if errorlevel 1 exit /b 1

call :ensure_tesseract
if errorlevel 1 exit /b 1

if not exist "%ROOT%scripts\bp-dumper-py\lookup.json" (
    echo [ERROR] Missing scripts\bp-dumper-py\lookup.json
    echo Download the latest bp-dumper-py.zip from Dumper Apps releases — do not run from a partial copy.
    pause
    exit /b 1
)

echo [setup] Installing Python packages ^(first run may take a minute^)...
python -m pip install --upgrade pip -q 2>nul
python -m pip install -r "%ROOT%scripts\bp-dumper-py\requirements.txt" -q
if errorlevel 1 (
    echo [ERROR] pip install failed for BP Dumper. Check your internet connection.
    pause
    exit /b 1
)
echo.

echo Starting Dumper Apps...
start "Dumper Apps" cmd /k "cd /d "%ROOT%scripts\bp-dumper-py" && title Dumper Apps && python dumper.py --watch"

echo.
echo  ============================================================
echo   RUNNING
echo  ============================================================
echo.
echo   Paste your API key when the window asks ^(copy from Dumper Apps on the site^).
echo.
pause
exit /b 0

:ensure_python
where python >nul 2>nul
if not errorlevel 1 exit /b 0
echo Python not found.
where winget >nul 2>nul
if errorlevel 1 goto :python_manual
echo Installing Python via winget...
winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :python_manual
where python >nul 2>nul
if not errorlevel 1 exit /b 0
:python_manual
echo.
echo Install Python 3 from https://www.python.org/downloads/
echo Check "Add Python to PATH", then run START-HERE.bat again.
pause
exit /b 1

:ensure_tesseract
where tesseract >nul 2>nul
if not errorlevel 1 exit /b 0
if exist "%ROOT%scripts\rock-scan-ocr\vendor\tesseract\tesseract.exe" exit /b 0
if exist "C:\Program Files\Tesseract-OCR\tesseract.exe" exit /b 0
if exist "C:\Program Files (x86)\Tesseract-OCR\tesseract.exe" exit /b 0
echo Tesseract OCR not found ^(needed for Rock Scanner^).
where winget >nul 2>nul
if errorlevel 1 goto :tesseract_manual
set /p INSTALL_TESS="Install Tesseract now with winget? [Y/N] "
if /i not "!INSTALL_TESS!"=="Y" goto :tesseract_manual
winget install -e --id UB-Mannheim.TesseractOCR --accept-package-agreements --accept-source-agreements
where tesseract >nul 2>nul
if not errorlevel 1 exit /b 0
if exist "C:\Program Files\Tesseract-OCR\tesseract.exe" exit /b 0
:tesseract_manual
echo.
echo Install Tesseract from https://github.com/UB-Mannheim/tesseract/wiki
echo Then run START-HERE.bat again.
pause
exit /b 1
