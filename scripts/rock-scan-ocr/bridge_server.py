#!/usr/bin/env python3
"""
Localhost bridge for Rock Calculator OCR button.

Runs independently of BP Dumper log watching. Started automatically when BP Dumper
enters watch mode (Windows: `tray_app.py`; other OS: `bridge_server.py`), or manually:

  python tray_app.py      # Windows — tray + bridge
  python bridge_server.py # bridge only
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from bridge_convert import to_rock_scan_ocr_result
from region_store import load_region
from scan_service import perform_live_scan

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 38471

# Browser dev server + production site (bridge is localhost-only on the member's PC)
ALLOWED_ORIGINS = frozenset(
    {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "https://dumpers-repo.com",
        "https://www.dumpers-repo.com",
    }
)


def _resolve_port() -> int:
    raw = os.environ.get("ROCK_SCAN_BRIDGE_PORT", "").strip()
    if not raw:
        return DEFAULT_PORT
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_PORT


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "RockScanBridge/1.0"

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        sys.stderr.write(f"[rock-scan-bridge] {self.address_string()} - {format % args}\n")

    def _cors_origin(self) -> str | None:
        origin = self.headers.get("Origin", "").strip()
        if not origin:
            return None
        if origin in ALLOWED_ORIGINS:
            return origin
        if origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:"):
            return origin
        if "dumpers-repo.com" in origin:
            return origin
        return origin

    def _apply_cors_headers(self) -> None:
        origin = self._cors_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
            # Required when https://dumpers-repo.com calls http://127.0.0.1 (Chrome PNA)
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._apply_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._apply_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json(200, _health_payload())
            return
        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/scan":
            self._send_json(404, {"ok": False, "error": "Not found"})
            return

        result = perform_live_scan()
        if not result.ok or result.sc_ocr is None or result.composition is None:
            self._send_json(
                503,
                {
                    "ok": False,
                    "error": result.error or "Rock scan failed.",
                    "hints": result.hints or [],
                },
            )
            return

        payload = to_rock_scan_ocr_result(result.sc_ocr, result.composition)
        if not payload.get("ok"):
            self._send_json(
                422,
                {
                    "ok": False,
                    "error": payload.get("error", "Could not parse scan for calculator."),
                    "warnings": payload.get("warnings") or [],
                },
            )
            return

        self._send_json(200, payload)


def _health_payload() -> dict:
    return {
        "ok": True,
        "service": "rock-scan-bridge",
        "version": 1,
        "calibrated": load_region() is not None,
    }


def make_server(*, host: str = DEFAULT_HOST, port: int | None = None) -> ThreadingHTTPServer:
    listen_port = port if port is not None else _resolve_port()
    return ThreadingHTTPServer((host, listen_port), BridgeHandler)


def run_server(*, host: str = DEFAULT_HOST, port: int | None = None) -> None:
    httpd = make_server(host=host, port=port)
    listen_port = httpd.server_address[1]
    print(f"Rock scan bridge listening on http://{host}:{listen_port}", flush=True)
    print("Endpoints: GET /health  POST /scan", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nRock scan bridge stopped.", flush=True)
    finally:
        httpd.server_close()


def start_bridge_daemon(*, host: str = DEFAULT_HOST, port: int | None = None) -> threading.Thread:
    thread = threading.Thread(
        target=run_server,
        kwargs={"host": host, "port": port},
        name="rock-scan-bridge",
        daemon=True,
    )
    thread.start()
    return thread


def main() -> int:
    parser = argparse.ArgumentParser(description="Localhost bridge for Rock Calculator OCR.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument(
        "--daemon",
        action="store_true",
        help="Compatibility flag when launched beside BP Dumper (same as default).",
    )
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
