"""Shared live capture + OCR for CLI and localhost bridge."""

from __future__ import annotations

import sys
import threading
from pathlib import Path

from capture import crop_fraction, is_mostly_black
from composition_parse import parse_composition_from_panel
from focus_helper import get_foreground_hwnd
from game_window import find_star_citizen_window
from live_scan_types import LiveScanResult
from panel_crop import PanelFractions
from region_store import load_region
from scan_overlay_flow import run_bridge_scan_overlay
from scan_progress_overlay import ScanProgressReporter
from sc_ocr_enrich import enrich_sc_ocr_from_panel
from sc_toolbox import ensure_sc_ocr_import, resolve_mining_signals_path
from ui_thread import run_on_ui_thread

_scan_lock = threading.Lock()


def _run_sc_ocr(panel_img, mining_signals: Path) -> dict:
    ensure_sc_ocr_import(mining_signals)
    from ocr.sc_ocr.api import scan_hud_onnx  # noqa: PLC0415

    region = {"x": 0, "y": 0, "w": panel_img.width, "h": panel_img.height}
    return scan_hud_onnx(region, _img_override=panel_img)


def _scan_captured_panel(
    *,
    fractions: PanelFractions,
    client_img,
    capture_method: str,
    game_focused: bool,
    mining_signals: Path,
    progress: ScanProgressReporter | None = None,
) -> LiveScanResult:
    frozen_capture = capture_method.startswith("frozen")

    if not frozen_capture and not game_focused and capture_method.startswith("mss-screen"):
        if progress is not None:
            progress.set_header("Could not switch to Star Citizen")
        return LiveScanResult(
            ok=False,
            error="Could not switch to Star Citizen for screen capture.",
            hints=[
                "Windows blocked the tray app from bringing the game forward.",
                "Click the Star Citizen window once, then press OCR again.",
                "Keep the game in Borderless Windowed (not Exclusive Fullscreen).",
            ],
        )

    panel_img = crop_fraction(client_img, fractions)

    if is_mostly_black(client_img):
        if progress is not None:
            progress.set_header("Capture failed — image was black")
        return LiveScanResult(
            ok=False,
            error="Capture failed: game image is black.",
            hints=[
                "Use Borderless Windowed (not Exclusive Fullscreen).",
                "Keep the rock RESULTS panel open when you click OCR.",
            ],
        )

    if progress is not None:
        progress.set_header("Running HUD reader…")

    sc_ocr = _run_sc_ocr(panel_img, mining_signals)
    sc_ocr = enrich_sc_ocr_from_panel(sc_ocr, panel_img)

    if progress is not None:
        progress.set_header("Reading composition…")

    mineral_hint = sc_ocr.get("mineral_name")
    composition = parse_composition_from_panel(panel_img, mineral_hint=mineral_hint).as_dict()

    if progress is not None:
        if composition.get("ok") and sc_ocr.get("mass") is not None:
            progress.set_header("Scan complete — returning to Rock Calculator…")
        else:
            progress.set_header("Scan finished — some fields could not be read")

    return LiveScanResult(ok=True, sc_ocr=sc_ocr, composition=composition)


def _perform_live_scan_ui(
    sc_toolbox: str | None,
    require_saved_region: bool,
    *,
    browser_hwnd: int,
) -> LiveScanResult:
    window = find_star_citizen_window()
    if window is None:
        return LiveScanResult(
            ok=False,
            error="Star Citizen game window not found.",
            hints=[
                "Launch the game (not RSI Launcher) with the rock RESULTS panel visible.",
            ],
        )

    saved = load_region()
    if saved is None:
        if require_saved_region:
            return LiveScanResult(
                ok=False,
                error="No capture region saved.",
                hints=[
                    "Right-click the BP Dumper tray icon → Calibrate RESULTS panel.",
                    "Draw the RESULTS box on the overlay, then press Enter.",
                ],
            )
        return LiveScanResult(ok=False, error="No capture region saved.")

    mining_signals = resolve_mining_signals_path(sc_toolbox)

    def scan_fn(
        fractions: PanelFractions,
        *,
        client_img,
        capture_method: str,
        capture_notes: list[str],
        game_focused: bool,
        progress: ScanProgressReporter | None = None,
    ) -> LiveScanResult:
        _ = capture_notes
        return _scan_captured_panel(
            fractions=fractions,
            client_img=client_img,
            capture_method=capture_method,
            game_focused=game_focused,
            mining_signals=mining_signals,
            progress=progress,
        )

    return run_bridge_scan_overlay(
        window,
        saved,
        return_focus_hwnd=browser_hwnd,
        scan_fn=scan_fn,
    )


def perform_live_scan(
    *,
    sc_toolbox: str | None = None,
    require_saved_region: bool = True,
) -> LiveScanResult:
    """Capture the calibrated RESULTS panel and run SC_OCR + composition OCR."""
    if not _scan_lock.acquire(blocking=False):
        return LiveScanResult(
            ok=False,
            error="A rock scan is already in progress.",
            hints=["Wait for the current scan to finish, then try again."],
        )

    browser_hwnd = get_foreground_hwnd()

    def _ui_job() -> LiveScanResult:
        return _perform_live_scan_ui(
            sc_toolbox,
            require_saved_region,
            browser_hwnd=browser_hwnd,
        )

    try:
        return run_on_ui_thread(_ui_job)
    except FileNotFoundError as exc:
        return LiveScanResult(ok=False, error=str(exc))
    except Exception as exc:  # pragma: no cover
        return LiveScanResult(ok=False, error=f"Rock scan failed: {exc}")
    finally:
        _scan_lock.release()
