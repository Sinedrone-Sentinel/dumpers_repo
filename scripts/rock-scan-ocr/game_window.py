"""Find the Star Citizen game client window (not RSI Launcher). Windows only."""

from __future__ import annotations

import ctypes
from ctypes import wintypes
from dataclasses import dataclass


class _RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


class _POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


PROCESS_QUERY_LIMITED_INFORMATION = 0x1000


@dataclass(frozen=True)
class GameWindow:
    hwnd: int
    title: str
    pid: int
    process_name: str
    client_left: int
    client_top: int
    client_width: int
    client_height: int

    @property
    def client_screen_rect(self) -> dict[str, int]:
        return {
            "left": self.client_left,
            "top": self.client_top,
            "width": self.client_width,
            "height": self.client_height,
        }


def _process_image_name(pid: int) -> str | None:
    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return None
    try:
        psapi = ctypes.windll.psapi
        buf = ctypes.create_unicode_buffer(32768)
        if psapi.GetModuleFileNameExW(handle, None, buf, len(buf)) == 0:
            return None
        path = buf.value.replace("/", "\\")
        return path.rsplit("\\", 1)[-1].lower()
    finally:
        kernel32.CloseHandle(handle)


def _client_rect_screen(hwnd: int) -> tuple[int, int, int, int] | None:
    user32 = ctypes.windll.user32
    rect = _RECT()
    if not user32.GetClientRect(hwnd, ctypes.byref(rect)):
        return None
    width = rect.right - rect.left
    height = rect.bottom - rect.top
    if width <= 0 or height <= 0:
        return None
    origin = _POINT(0, 0)
    if not user32.ClientToScreen(hwnd, ctypes.byref(origin)):
        return None
    return origin.x, origin.y, width, height


def find_star_citizen_window() -> GameWindow | None:
    """Return the best visible StarCitizen.exe client window, if any."""
    from win_dpi import ensure_dpi_awareness

    ensure_dpi_awareness()
    user32 = ctypes.windll.user32
    matches: list[tuple[int, str, int, str]] = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def _enum_cb(hwnd: int, _lparam: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True
        if user32.IsIconic(hwnd):
            return True

        length = user32.GetWindowTextLengthW(hwnd)
        title = ""
        if length > 0:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value

        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        proc = _process_image_name(int(pid.value))
        if proc != "starcitizen.exe":
            return True

        lower_title = title.lower()
        if "launcher" in lower_title:
            return True

        matches.append((hwnd, title, int(pid.value), proc or ""))
        return True

    user32.EnumWindows(_enum_cb, 0)
    if not matches:
        return None

    hwnd, title, pid, proc = max(matches, key=lambda row: row[0])
    rect = _client_rect_screen(hwnd)
    if rect is None:
        return None
    left, top, width, height = rect
    return GameWindow(
        hwnd=hwnd,
        title=title,
        pid=pid,
        process_name=proc,
        client_left=left,
        client_top=top,
        client_width=width,
        client_height=height,
    )


def refresh_game_window(window: GameWindow) -> GameWindow:
    """Re-read client screen rect (resolution/DPI may change between calls)."""
    rect = _client_rect_screen(window.hwnd)
    if rect is None:
        return window
    left, top, width, height = rect
    return GameWindow(
        hwnd=window.hwnd,
        title=window.title,
        pid=window.pid,
        process_name=window.process_name,
        client_left=left,
        client_top=top,
        client_width=width,
        client_height=height,
    )
