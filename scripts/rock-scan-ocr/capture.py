"""Screen capture helpers for rock-scan OCR testing."""

from __future__ import annotations

import ctypes
import time
from ctypes import wintypes

import mss
import numpy as np
from PIL import Image

from focus_helper import force_foreground, get_foreground_hwnd, restore_focus
from game_window import GameWindow


class _BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", wintypes.DWORD),
        ("biWidth", wintypes.LONG),
        ("biHeight", wintypes.LONG),
        ("biPlanes", wintypes.WORD),
        ("biBitCount", wintypes.WORD),
        ("biCompression", wintypes.DWORD),
        ("biSizeImage", wintypes.DWORD),
        ("biXPelsPerMeter", wintypes.LONG),
        ("biYPelsPerMeter", wintypes.LONG),
        ("biClrUsed", wintypes.DWORD),
        ("biClrImportant", wintypes.DWORD),
    ]


class _BITMAPINFO(ctypes.Structure):
    _fields_ = [("bmiHeader", _BITMAPINFOHEADER), ("bmiColors", wintypes.DWORD * 3)]


PW_RENDERFULLCONTENT = 0x00000002


def focus_window(hwnd: int) -> bool:
    return focus_game_window(hwnd)


def focus_game_window(hwnd: int) -> bool:
    """Bring Star Citizen to the foreground (browser-triggered scans)."""
    focused = force_foreground(hwnd)
    if focused:
        time.sleep(0.35)
    return focused


def image_median_luma(img: Image.Image) -> float:
    gray = np.asarray(img.convert("L"), dtype=np.uint8)
    return float(np.median(gray))


def is_mostly_black(img: Image.Image, *, threshold: float = 12.0) -> bool:
    return image_median_luma(img) < threshold


def crop_fraction(img: Image.Image, frac) -> Image.Image:
    width, height = img.size
    left = int(round(frac.x * width))
    top = int(round(frac.y * height))
    right = left + max(1, int(round(frac.width * width)))
    bottom = top + max(1, int(round(frac.height * height)))
    return img.crop((left, top, right, bottom))


def grab_window_client(hwnd: int, width: int, height: int) -> Image.Image | None:
    """Capture client area via PrintWindow (works when another app is focused)."""
    user32 = ctypes.windll.user32
    gdi32 = ctypes.windll.gdi32

    hwnd_dc = user32.GetDC(hwnd)
    if not hwnd_dc:
        return None

    mem_dc = gdi32.CreateCompatibleDC(hwnd_dc)
    bitmap = gdi32.CreateCompatibleBitmap(hwnd_dc, width, height)
    old_obj = gdi32.SelectObject(mem_dc, bitmap)

    try:
        ok = user32.PrintWindow(hwnd, mem_dc, PW_RENDERFULLCONTENT)
        if not ok:
            ok = user32.PrintWindow(hwnd, mem_dc, 0)
        if not ok:
            return None

        bmi = _BITMAPINFO()
        bmi.bmiHeader.biSize = ctypes.sizeof(_BITMAPINFOHEADER)
        bmi.bmiHeader.biWidth = width
        bmi.bmiHeader.biHeight = -height
        bmi.bmiHeader.biPlanes = 1
        bmi.bmiHeader.biBitCount = 32
        bmi.bmiHeader.biCompression = 0

        buffer_size = width * height * 4
        buffer = ctypes.create_string_buffer(buffer_size)
        lines = gdi32.GetDIBits(
            mem_dc,
            bitmap,
            0,
            height,
            buffer,
            ctypes.byref(bmi),
            0,
        )
        if lines == 0:
            return None

        image = Image.frombuffer("RGBA", (width, height), buffer.raw, "raw", "BGRA", 0, 1)
        return image.convert("RGB")
    finally:
        gdi32.SelectObject(mem_dc, old_obj)
        gdi32.DeleteObject(bitmap)
        gdi32.DeleteDC(mem_dc)
        user32.ReleaseDC(hwnd, hwnd_dc)


def grab_screen_rect(rect: dict[str, int]) -> Image.Image:
    monitor = {
        "left": int(rect["left"]),
        "top": int(rect["top"]),
        "width": int(rect["width"]),
        "height": int(rect["height"]),
    }
    with mss.mss() as sct:
        shot = sct.grab(monitor)
        return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")


def capture_game_frames(
    window: GameWindow,
    *,
    focus_first: bool = False,
) -> tuple[Image.Image, str, list[str]]:
    """Return (client_image, method_name, notes).

    Default does NOT steal focus — uses PrintWindow, then screen grab fallback.
    """
    notes: list[str] = []
    if focus_first:
        focus_window(window.hwnd)
        notes.append("Focused Star Citizen window before capture.")

    client_img = grab_window_client(
        window.hwnd, window.client_width, window.client_height
    )
    method = "printwindow"

    if client_img is None:
        notes.append("PrintWindow unavailable (common in Exclusive Fullscreen).")
        client_img = grab_screen_rect(window.client_screen_rect)
        method = "mss-screen"
        notes.append("Fell back to screen capture (game must be visible on screen).")
    elif is_mostly_black(client_img):
        notes.append(
            f"PrintWindow capture looked black (median luma {image_median_luma(client_img):.1f})."
        )
        screen_img = grab_screen_rect(window.client_screen_rect)
        if not is_mostly_black(screen_img):
            client_img = screen_img
            method = "mss-screen-after-black-printwindow"
            notes.append("Recaptured via screen coordinates (mss).")
        else:
            notes.append(
                "Screen capture also black. Use Borderless Windowed and keep the game visible."
            )

    return client_img, method, notes


def capture_for_bridge_scan(
    window: GameWindow,
) -> tuple[Image.Image, str, list[str], bool]:
    """Switch to the game for capture; leave focus on Star Citizen afterward."""
    notes = ["Switching to Star Citizen for HUD capture."]
    focused = focus_game_window(window.hwnd)
    if focused:
        notes.append("Star Citizen is in the foreground.")
    else:
        notes.append(
            "Could not bring Star Citizen to the foreground (Windows focus lock)."
        )
    img, method, cap_notes = capture_game_frames(window, focus_first=False)
    notes.extend(cap_notes)
    return img, method, notes, focused


def capture_for_live_test(
    window: GameWindow,
    *,
    return_focus_hwnd: int | None = None,
) -> tuple[Image.Image, str, list[str]]:
    """Flash-focus the game for one grab, then restore the previous window."""
    notes: list[str] = []
    restore_to = (
        return_focus_hwnd if return_focus_hwnd is not None else get_foreground_hwnd()
    )
    notes.append("Brief game focus for capture; restoring terminal focus.")
    focus_window(window.hwnd)
    try:
        img, method, cap_notes = capture_game_frames(window, focus_first=False)
        notes.extend(cap_notes)
        return img, method, notes
    finally:
        restore_focus(restore_to)

