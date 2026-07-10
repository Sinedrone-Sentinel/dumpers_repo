"""Per-user local capture region (not committed to git)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from panel_crop import PanelFractions

REGION_FILE = Path(__file__).resolve().parent / "capture-region.json"


@dataclass(frozen=True)
class SavedRegion:
    fractions: PanelFractions
    calibrated_at: str
    client_width: int
    client_height: int

    def as_dict(self) -> dict:
        return {
            "version": 1,
            "fractions": self.fractions.as_dict(),
            "calibrated_at": self.calibrated_at,
            "reference_client_size": {
                "width": self.client_width,
                "height": self.client_height,
            },
            "notes": "Local per-user RESULTS panel box. Re-calibrate from the BP Dumper tray if SC resolution changes.",
        }


def fractions_from_pixels(
    x0: int, y0: int, x1: int, y1: int, client_w: int, client_h: int
) -> PanelFractions:
    left = max(0, min(x0, x1))
    top = max(0, min(y0, y1))
    right = min(client_w, max(x0, x1))
    bottom = min(client_h, max(y0, y1))
    width = max(1, right - left)
    height = max(1, bottom - top)
    return PanelFractions(
        x=left / client_w,
        y=top / client_h,
        width=width / client_w,
        height=height / client_h,
    )


def save_region(
    fractions: PanelFractions, *, client_width: int, client_height: int
) -> Path:
    payload = SavedRegion(
        fractions=fractions,
        calibrated_at=datetime.now(timezone.utc).isoformat(),
        client_width=client_width,
        client_height=client_height,
    )
    REGION_FILE.write_text(json.dumps(payload.as_dict(), indent=2), encoding="utf-8")
    return REGION_FILE


def load_region() -> SavedRegion | None:
    if not REGION_FILE.is_file():
        return None
    try:
        data = json.loads(REGION_FILE.read_text(encoding="utf-8"))
        frac = data.get("fractions") or {}
        ref = data.get("reference_client_size") or {}
        return SavedRegion(
            fractions=PanelFractions(
                x=float(frac["x"]),
                y=float(frac["y"]),
                width=float(frac["width"]),
                height=float(frac["height"]),
            ),
            calibrated_at=str(data.get("calibrated_at", "")),
            client_width=int(ref.get("width", 0)),
            client_height=int(ref.get("height", 0)),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def require_region() -> SavedRegion:
    saved = load_region()
    if saved is None:
        raise FileNotFoundError(
            f"No capture region saved. Right-click the BP Dumper tray icon → "
            f"Calibrate RESULTS panel.\n(Expected file: {REGION_FILE})"
        )
    return saved
