"""Thread-safe scan phase for GET /scan/status (browser progress while POST /scan runs)."""

from __future__ import annotations

import threading

_lock = threading.Lock()
_active = False
_phase = ""


def begin_scan(phase: str = "Starting rock scan…") -> None:
    with _lock:
        global _active, _phase
        _active = True
        _phase = phase


def set_scan_phase(phase: str) -> None:
    with _lock:
        global _phase
        _phase = phase


def end_scan() -> None:
    with _lock:
        global _active, _phase
        _active = False
        _phase = ""


def get_scan_status() -> dict:
    with _lock:
        return {"ok": True, "active": _active, "phase": _phase}


class BridgeScanStatusReporter:
    """Updates bridge scan status for the Rock Calculator tab to poll."""

    def set_header(self, text: str) -> None:
        set_scan_phase(text)
