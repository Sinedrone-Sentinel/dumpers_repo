@echo off
setlocal enabledelayedexpansion

:: Check Python installation
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3 (https://www.python.org/downloads/) and check
    echo the "Add Python to PATH" option during installation.
    echo.
    pause
    exit /b 1
)

:: Prefer an isolated venv so pip does not clash with other global packages
if not exist ".venv\Scripts\python.exe" (
    echo Creating local virtual environment (.venv^)...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Could not create .venv. Try: python -m venv .venv
        echo.
        pause
        exit /b 1
    )
)

set "PY=.venv\Scripts\python.exe"

echo Installing dependencies into .venv...
"%PY%" -m pip install -q -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] pip install failed. See messages above.
    echo.
    pause
    exit /b 1
)

:: Run python script forwarding all args
"%PY%" dumper.py %*

if not "%~1"=="" (
    exit /b %errorlevel%
)

echo.
pause
