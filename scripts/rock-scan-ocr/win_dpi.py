"""Windows DPI awareness — overlay geometry must match physical client pixels."""

from __future__ import annotations

import ctypes
import sys

_dpi_ready = False


def ensure_dpi_awareness() -> None:
    """Make GetClientRect / tk geometry agree with mss screen captures."""
    global _dpi_ready
    if _dpi_ready or sys.platform != "win32":
        return
    _dpi_ready = True
    try:
        # PROCESS_PER_MONITOR_DPI_AWARE_V2
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        return
    except Exception:
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        return
    except Exception:
        pass
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass
