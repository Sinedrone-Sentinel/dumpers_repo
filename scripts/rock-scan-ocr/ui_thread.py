"""Dedicated UI thread for tkinter overlays (bridge handlers are not thread-safe)."""

from __future__ import annotations

import queue
import threading
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")

_ui_queue: queue.Queue | None = None
_ui_thread: threading.Thread | None = None
_ui_lock = threading.Lock()


def ensure_ui_thread() -> queue.Queue:
    global _ui_queue, _ui_thread
    with _ui_lock:
        if _ui_queue is not None and _ui_thread is not None and _ui_thread.is_alive():
            return _ui_queue

        _ui_queue = queue.Queue()

        def _loop() -> None:
            assert _ui_queue is not None
            while True:
                item = _ui_queue.get()
                if item is None:
                    break
                fn, done, holder = item
                try:
                    holder["value"] = fn()
                except Exception as exc:  # pragma: no cover
                    holder["error"] = exc
                finally:
                    done.set()

        _ui_thread = threading.Thread(target=_loop, name="rock-scan-ui", daemon=True)
        _ui_thread.start()
        return _ui_queue


def run_on_ui_thread(fn: Callable[[], T], *, timeout: float = 180.0) -> T:
    """Run *fn* on the shared UI thread and block until it returns."""
    ui_queue = ensure_ui_thread()
    done = threading.Event()
    holder: dict = {}
    ui_queue.put((fn, done, holder))
    if not done.wait(timeout):
        raise TimeoutError("Rock scan UI timed out.")
    if "error" in holder:
        raise holder["error"]
    return holder["value"]
