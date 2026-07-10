"""Live scan overlay: confirm RESULTS box, capture, OCR, status feedback."""

from __future__ import annotations

import tkinter as tk
from collections.abc import Callable

from calibrate_overlay import confirm_region_on_snapshot
from capture import capture_for_live_test, capture_game_frames, focus_game_window
from focus_helper import restore_focus
from game_window import GameWindow
from live_scan_types import LiveScanResult
from panel_crop import PanelFractions
from region_store import SavedRegion, save_region


def _run_with_status_banner(
    window: GameWindow,
    message: str,
    work: Callable[[], LiveScanResult],
) -> LiveScanResult:
    root = tk.Tk()
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    root.configure(bg="#102018")

    label = tk.Label(
        root,
        text=message,
        fg="#9dffb3",
        bg="#102018",
        font=("Segoe UI", 11, "bold"),
        padx=16,
        pady=10,
    )
    label.pack()
    root.update_idletasks()
    width = root.winfo_reqwidth()
    height = root.winfo_reqheight()
    left = window.client_left + max(0, (window.client_width - width) // 2)
    top = window.client_top + 24
    root.geometry(f"{width}x{height}+{left}+{top}")
    root.update()

    result = work()

    if result.ok:
        label.config(text="Scan complete — check the Rock Calculator", fg="#9dffb3")
    else:
        label.config(
            text=(result.error or "Scan failed")[:72],
            fg="#ffb3b3",
            bg="#201018",
        )
        root.configure(bg="#201018")
    root.update()
    root.after(1100, root.destroy)
    root.mainloop()
    return result


def run_bridge_scan_overlay(
    window: GameWindow,
    saved: SavedRegion,
    *,
    return_focus_hwnd: int,
    scan_fn: Callable[..., LiveScanResult],
) -> LiveScanResult:
    """
    Switch to the game, show the dimmed confirm overlay, run scan_fn on Enter.

    scan_fn receives the confirmed/adjusted panel fractions after the overlay closes.
    """
    focused = focus_game_window(window.hwnd)
    snapshot, _method, _notes = capture_game_frames(window, focus_first=False)

    result_holder: list[LiveScanResult] = []

    def after_confirm(fractions: PanelFractions) -> tuple[bool, str]:
        save_region(
            fractions,
            client_width=window.client_width,
            client_height=window.client_height,
        )

        def work() -> LiveScanResult:
            client_img, capture_method, capture_notes, game_focused = _capture_after_confirm(
                window,
                return_focus_hwnd=return_focus_hwnd,
                focused=focused,
            )
            return scan_fn(
                fractions,
                client_img=client_img,
                capture_method=capture_method,
                capture_notes=capture_notes,
                game_focused=game_focused,
            )

        result = _run_with_status_banner(window, "Scanning RESULTS panel…", work)
        result_holder.append(result)
        restore_focus(return_focus_hwnd)
        if result.ok:
            return True, "Scan complete"
        return False, result.error or "Scan failed"

    fractions = confirm_region_on_snapshot(
        window,
        snapshot,
        return_focus_hwnd=return_focus_hwnd,
        initial_fractions=saved.fractions,
        enter_label="Enter = scan now  |  Esc = cancel",
        after_confirm=after_confirm,
        restore_focus_on_finish=False,
    )
    if fractions is None:
        restore_focus(return_focus_hwnd)
        return LiveScanResult(ok=False, error="Scan cancelled.")

    if result_holder:
        return result_holder[0]
    return LiveScanResult(ok=False, error="Scan did not complete.")


def _capture_after_confirm(
    window: GameWindow,
    *,
    return_focus_hwnd: int,
    focused: bool,
) -> tuple:
    """Live grab after the confirm overlay closes."""
    from capture import capture_for_bridge_scan  # noqa: PLC0415

    if focused:
        return capture_for_bridge_scan(window)

    client_img, capture_method, capture_notes = capture_for_live_test(
        window, return_focus_hwnd=return_focus_hwnd
    )
    return client_img, capture_method, capture_notes, True
