"""Live scan overlay: confirm RESULTS box, frozen capture, OCR, per-row checkmarks."""

from __future__ import annotations

from collections.abc import Callable

from capture import capture_game_frames, focus_game_window
from focus_helper import restore_focus
from game_window import GameWindow
from live_scan_types import LiveScanResult
from panel_crop import PanelFractions
from region_store import SavedRegion
from scan_progress_overlay import BridgeScanOverlay, ScanProgressReporter


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
    snapshot, _method, _notes = capture_game_frames(window, focus_first=False)

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
