"""Live scan overlay: confirm RESULTS box, capture, OCR, per-row checkmarks."""

from __future__ import annotations

from collections.abc import Callable

from capture import capture_for_live_test, capture_game_frames, focus_game_window
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
    Switch to the game, show the dimmed confirm overlay, run scan_fn on Enter.

    Overlay stays up during OCR with per-row checkmarks beside the RESULTS panel.
    """
    focused = focus_game_window(window.hwnd)
    snapshot, _method, _notes = capture_game_frames(window, focus_first=False)

    def on_scan(
        fractions: PanelFractions,
        reporter: ScanProgressReporter,
    ) -> LiveScanResult:
        overlay = reporter._overlay  # noqa: SLF001

        reporter.set_header("Capturing live frame…")
        overlay.root.withdraw()
        overlay.root.update_idletasks()

        client_img, capture_method, capture_notes, game_focused = _capture_after_confirm(
            window,
            return_focus_hwnd=return_focus_hwnd,
            focused=focused,
        )

        overlay._refresh_background(client_img)  # noqa: SLF001
        overlay.root.deiconify()
        overlay.root.update_idletasks()

        return scan_fn(
            fractions,
            client_img=client_img,
            capture_method=capture_method,
            capture_notes=capture_notes,
            game_focused=game_focused,
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


def _capture_after_confirm(
    window: GameWindow,
    *,
    return_focus_hwnd: int,
    focused: bool,
) -> tuple:
    """Live grab while the overlay is hidden."""
    from capture import capture_for_bridge_scan  # noqa: PLC0415

    if focused:
        return capture_for_bridge_scan(window)

    client_img, capture_method, capture_notes = capture_for_live_test(
        window, return_focus_hwnd=return_focus_hwnd
    )
    return client_img, capture_method, capture_notes, True
