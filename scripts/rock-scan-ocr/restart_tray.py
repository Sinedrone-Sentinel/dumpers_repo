#!/usr/bin/env python3
"""
Kill any running rock-scan tray/bridge, then start a fresh tray_app.py.

Used by RESTART-TRAY.bat / RESTART-TRAY.vbs so members reload code without
closing BP Dumper or running the full START-HERE.bat launcher.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PORT = 38471
LOG_FILE = Path(os.environ.get("TEMP", ".")) / "dumper-rock-scan-restart.log"


def _log(message: str) -> None:
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}"
    try:
        with LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        pass


def _bridge_url() -> str:
    port = os.environ.get("ROCK_SCAN_BRIDGE_PORT", "").strip() or str(DEFAULT_PORT)
    return f"http://127.0.0.1:{port}"


def _health_url() -> str:
    return f"{_bridge_url().rstrip('/')}/health"


def _bridge_running() -> bool:
    try:
        with urllib.request.urlopen(_health_url(), timeout=0.8) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def _port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.35):
            return True
    except OSError:
        return False


def _resolve_port() -> int:
    raw = os.environ.get("ROCK_SCAN_BRIDGE_PORT", "").strip()
    if not raw:
        return DEFAULT_PORT
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_PORT


def _kill_windows_rock_scan_processes() -> int:
    if sys.platform != "win32":
        return 0

    my_pid = os.getpid()
    ps = (
        "Get-CimInstance Win32_Process | "
        "Where-Object { "
        "$_.ProcessId -ne "
        f"{my_pid} -and $_.CommandLine -and ("
        "$_.CommandLine -like '*rock-scan-ocr*tray_app.py*' -or "
        "$_.CommandLine -like '*rock-scan-ocr*bridge_server.py*'"
        ") } | "
        "ForEach-Object { "
        "Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; "
        "$_.ProcessId "
        "}"
    )
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        _log(f"kill processes failed: {exc}")
        return 0

    killed = [line.strip() for line in completed.stdout.splitlines() if line.strip().isdigit()]
    return len(killed)


def _kill_port_listener(port: int) -> bool:
    if sys.platform != "win32":
        return False

    ps = (
        f"$p={port}; "
        "Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | "
        "ForEach-Object { "
        "Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue "
        "}"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            capture_output=True,
            timeout=10,
            check=False,
        )
        return True
    except (OSError, subprocess.TimeoutExpired):
        return False


def _python_for_tray() -> str:
    if sys.platform == "win32":
        pythonw = Path(sys.executable).with_name("pythonw.exe")
        if pythonw.is_file():
            return str(pythonw)
    return sys.executable


def _wait_for_bridge_down(*, port: int, timeout_s: float = 6.0) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if not _port_open(port) and not _bridge_running():
            return
        time.sleep(0.2)


def _start_tray() -> subprocess.Popen | None:
    script = SCRIPT_DIR / ("tray_app.py" if sys.platform == "win32" else "bridge_server.py")
    if not script.is_file():
        _log(f"tray script missing: {script}")
        return None

    creationflags = 0
    if sys.platform == "win32":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    return subprocess.Popen(
        [_python_for_tray(), str(script)],
        cwd=str(SCRIPT_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creationflags,
    )


def _wait_for_bridge_up(timeout_s: float = 10.0) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if _bridge_running():
            return True
        time.sleep(0.25)
    return False


def restart_tray(*, force: bool = True) -> int:
    port = _resolve_port()
    _log(f"restart_tray begin (force={force}, port={port})")

    if force or _bridge_running() or _port_open(port):
        killed = _kill_windows_rock_scan_processes()
        _log(f"killed {killed} rock-scan process(es)")
        if _port_open(port):
            _kill_port_listener(port)
        _wait_for_bridge_down(port=port)

    proc = _start_tray()
    if proc is None:
        _log("failed to launch tray_app.py")
        return 1

    if not _wait_for_bridge_up():
        _log("tray launched but bridge health check failed")
        return 1

    _log("rock-scan tray restarted successfully")
    return 0


def main() -> int:
    if sys.platform != "win32":
        print("Tray restart helper is intended for Windows.", file=sys.stderr)
    return restart_tray(force=True)


if __name__ == "__main__":
    raise SystemExit(main())
