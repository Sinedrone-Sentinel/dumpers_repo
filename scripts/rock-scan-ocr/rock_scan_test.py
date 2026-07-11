#!/usr/bin/env python3
"""
Local rock-scan OCR test harness.

One command for live capture:
  python rock_scan_test.py

Shows the region overlay on a frozen snapshot (pre-loaded if you've scanned before).
Press Enter to confirm the box and immediately capture + OCR.

Offline replay:
  python rock_scan_test.py --from-image path/to/panel.png
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from calibrate_flow import run_calibration_overlay
from capture import (
    capture_for_live_test,
    crop_fraction,
    is_mostly_black,
    image_median_luma,
)
from focus_helper import get_foreground_hwnd
from game_window import find_star_citizen_window
from panel_crop import default_panel_fractions, panel_pixels_from_fractions
from region_store import SavedRegion, load_region
from sc_toolbox import ensure_sc_ocr_import, resolve_mining_signals_path
from accuracy_policy import (
    ACCURACY_NOTES,
    ACCURACY_TARGETS,
    NEVER_OCR_FIELDS,
    PASS_THROUGH_FIELDS,
)
from composition_parse import parse_composition_from_panel


def _default_export_root() -> Path:
    return Path(__file__).resolve().parent / "rock-scan-exports"


def _run_sc_ocr(panel_img: Image.Image, mining_signals: Path) -> tuple[dict, list[str]]:
    model_notes = ensure_sc_ocr_import(mining_signals)
    from ocr.sc_ocr.api import scan_hud_onnx  # noqa: PLC0415

    region = {
        "x": 0,
        "y": 0,
        "w": panel_img.width,
        "h": panel_img.height,
    }
    return scan_hud_onnx(region, _img_override=panel_img), model_notes


def _run_composition_ocr(panel_img: Image.Image, mineral_hint: str | None = None) -> tuple[dict, list[str]]:
    parsed = parse_composition_from_panel(panel_img, mineral_hint=mineral_hint)
    return parsed.as_dict(), list(parsed.ocr_lines)


def _export_bundle(
    export_dir: Path,
    *,
    panel_img: Image.Image,
    client_img: Image.Image | None,
    sc_ocr: dict,
    window_meta: dict,
    panel_rect: dict,
    ocr_source_rect: dict,
    ocr_mode: str,
    model_notes: list[str],
    capture_notes: list[str],
    capture_method: str,
    calibrated_fractions: dict[str, float] | None,
    composition: dict | None,
    ocr_lines: list[str] | None,
    mining_signals: Path,
    source: str,
) -> Path:
    export_dir.mkdir(parents=True, exist_ok=True)
    panel_img.save(export_dir / "panel-crop.png")
    if client_img is not None:
        client_img.save(export_dir / "game-client.png")

    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "phase": "2-sc_ocr-plus-composition",
        "source": source,
        "accuracy_targets": ACCURACY_TARGETS,
        "pass_through_fields": PASS_THROUGH_FIELDS,
        "never_ocr_fields": NEVER_OCR_FIELDS,
        "notes": ACCURACY_NOTES
        + [
            "Composition slice uses INERT as bottom anchor (value ignored).",
            "Compare panel-crop.png against sc_ocr + composition fields.",
        ],
        "sc_toolbox_mining_signals": str(mining_signals.resolve()),
        "window": window_meta,
        "calibrated_fractions": calibrated_fractions,
        "panel_screen_rect": panel_rect,
        "ocr_mode": ocr_mode,
        "ocr_source_rect": ocr_source_rect,
        "capture_method": capture_method,
        "capture_notes": capture_notes,
        "capture_median_luma": image_median_luma(client_img) if client_img is not None else None,
        "model_notes": model_notes,
        "sc_ocr": sc_ocr,
        "composition": composition,
        "files": {
            "panel_crop": "panel-crop.png",
            "game_client": "game-client.png" if client_img is not None else None,
            "ocr_lines": "ocr-lines.txt" if composition else None,
        },
    }
    result_path = export_dir / "result.json"
    result_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    if ocr_lines:
        (export_dir / "ocr-lines.txt").write_text("\n".join(ocr_lines), encoding="utf-8")
    return export_dir


def _confirm_capture_region(window) -> SavedRegion | None:
    """Snapshot overlay → Enter saves box and returns region (Esc cancels)."""
    saved = load_region()
    if saved:
        print("Saved box loaded — adjust if needed, or press Enter to scan.")
    else:
        print("Draw a box around the RESULTS panel, then press Enter to scan.")

    if not run_calibration_overlay(enter_label="Enter = save and scan"):
        return None

    saved = load_region()
    if saved is None:
        print("Failed to save capture region.", file=sys.stderr)
        return None
    return saved


def _run_ocr_pipeline(
    *,
    export_dir: Path,
    panel_img: Image.Image,
    client_img: Image.Image | None,
    saved: SavedRegion,
    window,
    panel_rect: dict,
    ocr_source_rect: dict,
    ocr_mode: str,
    capture_method: str,
    capture_notes: list[str],
    mining_signals: Path,
    source: str,
) -> int:
    sc_ocr, model_notes = _run_sc_ocr(
        client_img if ocr_mode == "full-client" and client_img is not None else panel_img,
        mining_signals,
    )
    mineral_hint = sc_ocr.get("mineral_name")
    composition, ocr_lines = _run_composition_ocr(panel_img, mineral_hint)

    if not sc_ocr.get("panel_visible"):
        print(
            "Warning: SC_OCR did not detect a mining RESULTS panel. "
            "Re-draw a tighter box around RESULTS on the overlay.",
            file=sys.stderr,
        )
    elif sc_ocr.get("mass") is None:
        print(
            "Warning: mass is empty — mass feeds total SCU in the calculator.",
            file=sys.stderr,
        )

    if not composition.get("ok"):
        print(f"Warning: composition OCR failed: {composition.get('error')}", file=sys.stderr)
    elif composition.get("warnings"):
        for warning in composition["warnings"]:
            print(f"Warning: {warning}", file=sys.stderr)

    client_rect = window.client_screen_rect if window else None
    window_meta = (
        {
            "hwnd": window.hwnd,
            "title": window.title,
            "pid": window.pid,
            "process_name": window.process_name,
            "client_screen_rect": client_rect,
            "calibrated_at": saved.calibrated_at,
            "calibrated_client_size": {
                "width": saved.client_width,
                "height": saved.client_height,
            },
        }
        if window
        else {"mode": source}
    )

    out = _export_bundle(
        export_dir,
        panel_img=panel_img,
        client_img=client_img,
        sc_ocr=sc_ocr,
        window_meta=window_meta,
        panel_rect=panel_rect,
        ocr_source_rect=ocr_source_rect,
        ocr_mode=ocr_mode,
        model_notes=model_notes,
        capture_notes=capture_notes,
        capture_method=capture_method,
        calibrated_fractions=saved.fractions.as_dict(),
        composition=composition,
        ocr_lines=ocr_lines,
        mining_signals=mining_signals,
        source=source,
    )
    print(f"Exported: {out}")
    print(json.dumps({"sc_ocr": sc_ocr, "composition": composition}, indent=2))
    return 0


def run_once(
    *,
    export_root: Path,
    sc_toolbox: str | None,
    from_image: str | None,
    ocr_mode: str,
    skip_calibrate: bool,
) -> int:
    mining_signals = resolve_mining_signals_path(sc_toolbox)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    export_dir = export_root / stamp

    if from_image:
        panel_path = Path(from_image).expanduser().resolve()
        if not panel_path.is_file():
            print(f"Image not found: {panel_path}", file=sys.stderr)
            return 1
        panel_img = Image.open(panel_path).convert("RGB")
        saved = load_region()
        if saved is None:
            saved = SavedRegion(
                fractions=default_panel_fractions(),
                calibrated_at="",
                client_width=panel_img.width,
                client_height=panel_img.height,
            )
        sc_ocr, model_notes = _run_sc_ocr(panel_img, mining_signals)
        mineral_hint = sc_ocr.get("mineral_name")
        composition, ocr_lines = _run_composition_ocr(panel_img, mineral_hint)
        out = _export_bundle(
            export_dir,
            panel_img=panel_img,
            client_img=None,
            sc_ocr=sc_ocr,
            window_meta={"mode": "offline-image", "image_path": str(panel_path)},
            panel_rect={
                "left": 0,
                "top": 0,
                "width": panel_img.width,
                "height": panel_img.height,
            },
            ocr_source_rect={
                "left": 0,
                "top": 0,
                "width": panel_img.width,
                "height": panel_img.height,
            },
            ocr_mode="from-image",
            model_notes=model_notes,
            capture_notes=[],
            capture_method="from-image",
            calibrated_fractions=saved.fractions.as_dict(),
            composition=composition,
            ocr_lines=ocr_lines,
            mining_signals=mining_signals,
            source="from-image",
        )
        print(f"Exported: {out}")
        print(json.dumps({"sc_ocr": sc_ocr, "composition": composition}, indent=2))
        return 0

    window = find_star_citizen_window()
    if window is None:
        print(
            "Star Citizen game window not found. Launch the game (not RSI Launcher) "
            "with a rock RESULTS panel visible.",
            file=sys.stderr,
        )
        return 1

    if skip_calibrate:
        saved = load_region()
        if saved is None:
            print(
                "No capture region saved. Run without --skip-calibrate first.",
                file=sys.stderr,
            )
            return 1
    else:
        saved = _confirm_capture_region(window)
        if saved is None:
            return 1

    print("Capturing live frame and running OCR...")
    client_rect = window.client_screen_rect
    panel_rect = panel_pixels_from_fractions(
        saved.fractions, window.client_width, window.client_height
    )

    client_img, capture_method, capture_notes = capture_for_live_test(
        window, return_focus_hwnd=get_foreground_hwnd()
    )
    panel_img = crop_fraction(client_img, saved.fractions)

    if is_mostly_black(client_img):
        print(
            "Capture failed: game image is black. In SC graphics settings use "
            "Borderless Windowed (not Exclusive Fullscreen), open the rock RESULTS "
            "panel, then run again.",
            file=sys.stderr,
        )
        return 1

    if ocr_mode == "full-client":
        ocr_source_rect = dict(client_rect)
        mode_label = "full-client"
    else:
        ocr_source_rect = dict(panel_rect)
        mode_label = "calibrated"

    return _run_ocr_pipeline(
        export_dir=export_dir,
        panel_img=panel_img,
        client_img=client_img,
        saved=saved,
        window=window,
        panel_rect=panel_rect,
        ocr_source_rect=ocr_source_rect,
        ocr_mode=mode_label,
        capture_method=capture_method,
        capture_notes=capture_notes,
        mining_signals=mining_signals,
        source="live-capture",
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Rock scan OCR: overlay to box the RESULTS panel, then capture + OCR on Enter."
        )
    )
    parser.add_argument(
        "--export-dir",
        default=str(_default_export_root()),
        help="Root folder for timestamped export bundles.",
    )
    parser.add_argument(
        "--sc-toolbox",
        default=None,
        help="Path to SC Toolbox tools/Mining_Signals (overrides sc-toolbox.path).",
    )
    parser.add_argument(
        "--from-image",
        default=None,
        help="Run OCR on a saved panel PNG instead of live game capture.",
    )
    parser.add_argument(
        "--ocr-mode",
        choices=("calibrated", "full-client"),
        default="calibrated",
        help="calibrated: use your saved box (default). full-client: whole game window.",
    )
    parser.add_argument(
        "--skip-calibrate",
        action="store_true",
        help="Skip the overlay and use the saved box (for --watch repeats).",
    )
    parser.add_argument(
        "--watch",
        type=float,
        default=0,
        metavar="SECONDS",
        help="Repeat capture every N seconds (Ctrl+C to stop).",
    )
    args = parser.parse_args()
    export_root = Path(args.export_dir).expanduser().resolve()

    if args.watch and args.watch > 0:
        if args.from_image:
            print("--watch cannot be used with --from-image", file=sys.stderr)
            return 1
        print(f"Watching every {args.watch}s — Ctrl+C to stop.")
        first = True
        try:
            while True:
                code = run_once(
                    export_root=export_root,
                    sc_toolbox=args.sc_toolbox,
                    from_image=None,
                    ocr_mode=args.ocr_mode,
                    skip_calibrate=not first,
                )
                first = False
                if code != 0:
                    return code
                time.sleep(args.watch)
        except KeyboardInterrupt:
            print("\nStopped.")
            return 0

    return run_once(
        export_root=export_root,
        sc_toolbox=args.sc_toolbox,
        from_image=args.from_image,
        ocr_mode=args.ocr_mode,
        skip_calibrate=args.skip_calibrate,
    )


if __name__ == "__main__":
    raise SystemExit(main())
