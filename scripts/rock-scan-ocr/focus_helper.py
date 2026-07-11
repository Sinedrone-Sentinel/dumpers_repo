"""Win32 focus helpers for calibration flow and bridge capture."""

from __future__ import annotations

import ctypes
import time

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

SW_RESTORE = 9
SW_SHOW = 5
HWND_TOPMOST = -1
HWND_NOTOPMOST = -2
SWP_NOMOVE = 0x0002
SWP_NOSIZE = 0x0001
SWP_SHOWWINDOW = 0x0040
VK_MENU = 0x12
KEYEVENTF_KEYUP = 0x0002


def get_foreground_hwnd() -> int:
    return int(user32.GetForegroundWindow())


def is_foreground(hwnd: int) -> bool:
    return hwnd != 0 and get_foreground_hwnd() == hwnd


def _pulse_alt_key() -> None:
    """Brief Alt press unlocks SetForegroundWindow from background callers."""
    user32.keybd_event(VK_MENU, 0, 0, 0)
    user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)


def _pulse_topmost(hwnd: int) -> None:
    user32.SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
    )
    user32.SetWindowPos(
        hwnd,
        HWND_NOTOPMOST,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
    )


def force_foreground(hwnd: int, *, max_attempts: int = 4) -> bool:
    """Bring hwnd to the foreground. Returns True when GetForegroundWindow matches."""
    if not hwnd or not user32.IsWindow(hwnd):
        return False

    user32.AllowSetForegroundWindow(0xFFFFFFFF)  # ASFW_ANY

    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)
    else:
        user32.ShowWindow(hwnd, SW_SHOW)

    for attempt in range(max_attempts):
        if is_foreground(hwnd):
            return True

        _pulse_alt_key()

        foreground = get_foreground_hwnd()
        fg_thread = user32.GetWindowThreadProcessId(foreground, None)
        target_thread = user32.GetWindowThreadProcessId(hwnd, None)
        current_thread = kernel32.GetCurrentThreadId()

        attached_pairs: list[tuple[int, int]] = []
        if fg_thread and target_thread and fg_thread != target_thread:
            user32.AttachThreadInput(fg_thread, target_thread, True)
            attached_pairs.append((fg_thread, target_thread))
        if attempt >= 1 and current_thread not in {fg_thread, target_thread}:
            if fg_thread and current_thread != fg_thread:
                user32.AttachThreadInput(current_thread, fg_thread, True)
                attached_pairs.append((current_thread, fg_thread))
            if target_thread and current_thread != target_thread:
                user32.AttachThreadInput(current_thread, target_thread, True)
                attached_pairs.append((current_thread, target_thread))

        try:
            user32.SwitchToThisWindow(hwnd, True)
        except (AttributeError, OSError):
            pass

        _pulse_topmost(hwnd)
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)

        for a, b in reversed(attached_pairs):
            user32.AttachThreadInput(a, b, False)

        time.sleep(0.15 + attempt * 0.1)

    return is_foreground(hwnd)


def restore_focus(hwnd: int) -> bool:
    if not hwnd:
        return False
    user32.ShowWindow(hwnd, SW_RESTORE)
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
    return is_foreground(hwnd)
