"""One-time RESULTS panel box calibration (overlay on frozen game snapshot)."""

from __future__ import annotations

import sys

from calibrate_overlay import confirm_region_on_snapshot, save_region_preview
from capture import capture_game_frames, focus_window
from focus_helper import get_foreground_hwnd, restore_focus
from game_window import find_star_citizen_window, refresh_game_window
from overlay_frame import normalize_snapshot
from region_store import load_region, save_region


def run_calibration_overlay(*, enter_label: str = "Enter = save") -> bool:
    """
    Show the calibration overlay on a game snapshot.

    Returns True when the user saves a box, False on cancel or error.
    """
    window = find_star_citizen_window()
    if window is None:
        print(
            "Star Citizen game window not found. Open the rock RESULTS panel, then try again.",
            file=sys.stderr,
        )
        return False

    return_focus = get_foreground_hwnd()
    print("Focusing game briefly to grab a screenshot for calibration...")
    focus_window(window.hwnd)
    window = refresh_game_window(window)
    snapshot, method, notes = capture_game_frames(window, focus_first=False)
    snapshot = normalize_snapshot(snapshot, window)
    restore_focus(return_focus)
    print(f"Calibration snapshot via {method}.")
    for note in notes:
        print(f"  {note}")

    saved = load_region()
    fractions = confirm_region_on_snapshot(
        window,
        snapshot,
        return_focus_hwnd=return_focus,
        initial_fractions=saved.fractions if saved else None,
        enter_label=enter_label,
    )
    if fractions is None:
        print("Calibration cancelled.")
        return False

    save_region(
        fractions,
        client_width=snapshot.width,
        client_height=snapshot.height,
    )
    preview_path = save_region_preview(snapshot, fractions)
    print(f"Saved capture region. Preview: {preview_path}")
    return True
