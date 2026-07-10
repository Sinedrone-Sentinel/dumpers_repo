"""Shared live capture + OCR for CLI and localhost bridge."""

from __future__ import annotations

import sys
import threading
from dataclasses import dataclass
from pathlib import Path

from capture import capture_for_bridge_scan, crop_fraction, is_mostly_black
from composition_parse import parse_composition_from_panel
from game_window import find_star_citizen_window
from panel_crop import panel_pixels_from_fractions
from region_store import SavedRegion, load_region
from sc_toolbox import ensure_sc_ocr_import, resolve_mining_signals_path

_scan_lock = threading.Lock()


@dataclass
class LiveScanResult:
    ok: bool
    sc_ocr: dict | None = None
    composition: dict | None = None
    error: str | None = None
    hints: list[str] | None = None


def _run_sc_ocr(panel_img, mining_signals: Path) -> dict:
    ensure_sc_ocr_import(mining_signals)
    from ocr.sc_ocr.api import scan_hud_onnx  # noqa: PLC0415

    region = {"x": 0, "y": 0, "w": panel_img.width, "h": panel_img.height}
    return scan_hud_onnx(region, _img_override=panel_img)


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

    try:
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
        client_img, capture_method, capture_notes, game_focused = capture_for_bridge_scan(
            window
        )
        if not game_focused and capture_method.startswith("mss-screen"):
            return LiveScanResult(
                ok=False,
                error="Could not switch to Star Citizen for screen capture.",
                hints=[
                    "Windows blocked the tray app from bringing the game forward.",
                    "Click the Star Citizen window once, then press OCR again.",
                    "Keep the game in Borderless Windowed (not Exclusive Fullscreen).",
                ],
            )
        panel_img = crop_fraction(client_img, saved.fractions)

        if is_mostly_black(client_img):
            return LiveScanResult(
                ok=False,
                error="Capture failed: game image is black.",
                hints=[
                    "Use Borderless Windowed (not Exclusive Fullscreen).",
                    "Keep the rock RESULTS panel open when you click OCR.",
                ],
            )

        sc_ocr = _run_sc_ocr(panel_img, mining_signals)
        mineral_hint = sc_ocr.get("mineral_name")
        composition = parse_composition_from_panel(panel_img, mineral_hint=mineral_hint).as_dict()

        return LiveScanResult(ok=True, sc_ocr=sc_ocr, composition=composition)
    except FileNotFoundError as exc:
        return LiveScanResult(ok=False, error=str(exc))
    except Exception as exc:  # pragma: no cover
        return LiveScanResult(ok=False, error=f"Rock scan failed: {exc}")
    finally:
        _scan_lock.release()
