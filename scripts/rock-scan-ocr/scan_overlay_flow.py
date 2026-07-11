"""Live scan overlay: confirm RESULTS box, frozen capture, OCR."""

from __future__ import annotations

from collections.abc import Callable

from capture import capture_game_frames, focus_game_window, is_mostly_black
from focus_helper import force_foreground, restore_focus
from game_window import GameWindow, refresh_game_window
from live_scan_types import LiveScanResult
from overlay_frame import normalize_snapshot
from panel_crop import PanelFractions, full_client_fractions
from region_store import SavedRegion
from scan_progress_overlay import BridgeScanOverlay, ScanProgressReporter
from scan_status import BridgeScanStatusReporter, set_scan_phase


def run_bridge_scan_full_frame(
    window: GameWindow,
    *,
    return_focus_hwnd: int,
    scan_fn: Callable[..., LiveScanResult],
) -> LiveScanResult:
    """
    Capture the game client and OCR the full frame (no selection overlay).

    Temporary test path so SC_OCR sees the native HUD layout.

    Focus the game to capture the HUD, verify the snapshot, then return to the
    Rock Calculator tab while OCR runs on the frozen frame.
    """
    set_scan_phase("Switching to Star Citizen…")
    focus_game_window(window.hwnd)
    window = refresh_game_window(window)

    set_scan_phase("Capturing mining HUD…")
    snapshot, method, notes = capture_game_frames(window, focus_first=False)
    snapshot = normalize_snapshot(snapshot, window)

    if is_mostly_black(snapshot):
        force_foreground(return_focus_hwnd)
        return LiveScanResult(
            ok=False,
            error="Capture failed: game image is black.",
            hints=[
                "Use Borderless Windowed (not Exclusive Fullscreen).",
                "Keep the rock RESULTS panel open when you click OCR.",
            ],
        )

    set_scan_phase("Returning to Rock Calculator…")
    force_foreground(return_focus_hwnd)

    fractions = full_client_fractions()
    progress = BridgeScanStatusReporter()

    try:
        return scan_fn(
            fractions,
            client_img=snapshot,
            capture_method="frozen-full-client",
            capture_notes=[
                "Full client frame — panel selection bypassed.",
                "Captured with game focused; OCR runs after returning to browser.",
                f"Capture via {method}.",
                *notes,
            ],
            game_focused=True,
            progress=progress,
        )
    finally:
        force_foreground(return_focus_hwnd)


def run_bridge_scan_overlay(
    window: GameWindow,
    saved: SavedRegion,
    *,
    return_focus_hwnd: int,
    scan_fn: Callable[..., LiveScanResult],
) -> LiveScanResult:
    """
    Switch to the game, show a frozen snapshot overlay, run scan_fn on Enter.

    OCR reads the same frozen frame displayed on the overlay — ship/HUD sway after
    the snapshot does not affect parsing.
    """
    focus_game_window(window.hwnd)
    window = refresh_game_window(window)
    snapshot, _method, _notes = capture_game_frames(window, focus_first=False)
    snapshot = normalize_snapshot(snapshot, window)

    def on_scan(
        fractions: PanelFractions,
        reporter: ScanProgressReporter,
    ) -> LiveScanResult:
        overlay = reporter._overlay  # noqa: SLF001
        reporter.set_header("Scanning frozen HUD frame…")

        client_img = overlay.bg_image.copy()
        capture_method = "frozen-overlay-snapshot"
        capture_notes = [
            "OCR uses the frozen frame shown on the overlay (ignores live ship sway).",
        ]

        return scan_fn(
            fractions,
            client_img=client_img,
            capture_method=capture_method,
            capture_notes=capture_notes,
            game_focused=True,
            progress=reporter,
        )

    overlay = BridgeScanOverlay(
        window,
        snapshot,
        return_focus_hwnd=return_focus_hwnd,
        initial_fractions=saved.fractions,
        on_scan=on_scan,
    )
    result = overlay.run()
    if result is None:
        restore_focus(return_focus_hwnd)
        return LiveScanResult(ok=False, error="Scan cancelled.")
    return result
