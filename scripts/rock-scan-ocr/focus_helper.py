"""Win32 focus helpers for calibration flow."""

from __future__ import annotations

import ctypes


def get_foreground_hwnd() -> int:
    return int(ctypes.windll.user32.GetForegroundWindow())


def restore_focus(hwnd: int) -> bool:
    if not hwnd:
        return False
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    if bool(user32.SetForegroundWindow(hwnd)):
        return True

    foreground = get_foreground_hwnd()
    if foreground == hwnd:
        return True

    current_thread = kernel32.GetCurrentThreadId()
    fg_thread = user32.GetWindowThreadProcessId(foreground, None)
    target_thread = user32.GetWindowThreadProcessId(hwnd, None)
    user32.AttachThreadInput(current_thread, fg_thread, True)
    user32.AttachThreadInput(current_thread, target_thread, True)
    user32.SetForegroundWindow(hwnd)
    user32.AttachThreadInput(current_thread, fg_thread, False)
    user32.AttachThreadInput(current_thread, target_thread, False)
    return get_foreground_hwnd() == hwnd
