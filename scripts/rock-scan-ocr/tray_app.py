#!/usr/bin/env python3
"""
System tray for rock-scan OCR.

- Keeps the localhost bridge running (Calculator OCR button).
- **Calibrate RESULTS panel** — one-time box per machine/resolution (tray menu).
- Does not block BP Dumper log watching (separate process).

Windows only for the tray UI; other platforms run bridge_server.py instead.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import threading
from pathlib import Path

DEFAULT_HOST = "127.0.0.1"


def _tray_image():
    from PIL import Image

    icon_path = Path(__file__).resolve().parent / "assets" / "tray.ico"
    if not icon_path.is_file():
        try:
            from build_tray_icon import build_tray_icon

            build_tray_icon()
        except Exception:
            pass
    if icon_path.is_file():
        return Image.open(icon_path).convert("RGBA")
    return Image.new("RGBA", (16, 16), (15, 23, 42, 255))


def _tray_title() -> str:
    from region_store import load_region

    if load_region() is None:
        return "Dumper Rock Scan — calibrate RESULTS panel"
    return "Dumper's Repo — Rock Scan ready"


def _run_bridge(httpd) -> None:
    try:
        httpd.serve_forever()
    except Exception:
        pass


def _run_windows_tray(*, host: str, port: int | None) -> int:
    import pystray

    from bridge_server import make_server
    from calibrate_flow import run_calibration_overlay
    from region_store import load_region
    from ui_thread import ensure_ui_thread

    ensure_ui_thread()

    httpd = make_server(host=host, port=port)
    listen_port = httpd.server_address[1]
    bridge_thread = threading.Thread(
        target=_run_bridge,
        args=(httpd,),
        name="rock-scan-bridge",
        daemon=True,
    )
    bridge_thread.start()
    print(f"Rock scan bridge listening on http://{host}:{listen_port}", flush=True)

    calibrating = threading.Lock()

    def calibrate_action(_icon: pystray.Icon, _item: pystray.MenuItem) -> None:
        if not calibrating.acquire(blocking=False):
            return
        try:
            run_calibration_overlay(enter_label="Enter = save")
            _icon.title = _tray_title()
        finally:
            calibrating.release()

    def quit_action(icon: pystray.Icon, _item: pystray.MenuItem) -> None:
        httpd.shutdown()
        icon.stop()

    def restart_action(_icon: pystray.Icon, _item: pystray.MenuItem) -> None:
        script = Path(__file__).resolve().parent / "restart_tray.py"
        if not script.is_file():
            return
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
        subprocess.Popen(
            [sys.executable, str(script)],
            cwd=str(script.parent),
            creationflags=creationflags,
        )

    menu = pystray.Menu(
        pystray.MenuItem("Calibrate RESULTS panel…", calibrate_action),
        pystray.MenuItem("Restart bridge (reload code)", restart_action),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit rock-scan tray", quit_action),
    )

    icon = pystray.Icon("dumper-rock-scan", _tray_image(), _tray_title(), menu)
    if load_region() is None:
        print(
            "No capture region yet — right-click tray icon → Calibrate RESULTS panel, "
            "then use OCR on the Rock Calculator.",
            flush=True,
        )

    icon.run()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rock scan tray (calibration) + localhost bridge for Calculator OCR."
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args()

    if sys.platform != "win32":
        from bridge_server import run_server

        print("Tray UI is Windows-only; running bridge without tray.", flush=True)
        run_server(host=args.host, port=args.port)
        return 0

    return _run_windows_tray(host=args.host, port=args.port)


if __name__ == "__main__":
    raise SystemExit(main())
