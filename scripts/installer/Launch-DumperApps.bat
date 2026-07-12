@echo off
setlocal
set "ROOT=%~dp0"
set "PYTHON=%ROOT%python-venv\Scripts\python.exe"
if not exist "%PYTHON%" set "PYTHON=%ROOT%python\python.exe"

if not exist "%PYTHON%" (
    echo [ERROR] Bundled Python missing. Reinstall Dumper Apps from the site.
    pause
    exit /b 1
)

cd /d "%ROOT%scripts\bp-dumper-py"
start "Dumper Apps" cmd /k ""%PYTHON%" dumper.py --watch"
exit /b 0
