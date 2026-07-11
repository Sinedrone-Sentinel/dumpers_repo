"""Saved RESULTS panel region (fractions of the game client area)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from panel_crop import PanelFractions

CONFIG_VERSION = 1
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "capture-region.json"


@dataclass(frozen=True)
class RegionConfig:
    fractions: PanelFractions
    calibrated_at: str
    reference_client_size: dict[str, int]

    def as_dict(self) -> dict:
        return {
            "version": CONFIG_VERSION,
            "fractions": self.fractions.as_dict(),
            "calibrated_at": self.calibrated_at,
            "reference_client_size": self.reference_client_size,
        }


def config_path(custom: str | Path | None = None) -> Path:
    if custom:
        return Path(custom).expanduser().resolve()
    return DEFAULT_CONFIG_PATH


def load_region_config(path: str | Path | None = None) -> RegionConfig | None:
    cfg_path = config_path(path)
    if not cfg_path.is_file():
        return None
    data = json.loads(cfg_path.read_text(encoding="utf-8"))
    frac = data.get("fractions") or {}
    return RegionConfig(
        fractions=PanelFractions(
            x=float(frac["x"]),
            y=float(frac["y"]),
            width=float(frac["width"]),
            height=float(frac["height"]),
        ),
        calibrated_at=str(data.get("calibrated_at", "")),
        reference_client_size={
            "width": int(data["reference_client_size"]["width"]),
            "height": int(data["reference_client_size"]["height"]),
        },
    )


def save_region_config(
    fractions: PanelFractions,
    *,
    client_width: int,
    client_height: int,
    path: str | Path | None = None,
) -> Path:
    cfg_path = config_path(path)
    payload = RegionConfig(
        fractions=fractions,
        calibrated_at=datetime.now(timezone.utc).isoformat(),
        reference_client_size={"width": client_width, "height": client_height},
    )
    cfg_path.write_text(json.dumps(payload.as_dict(), indent=2), encoding="utf-8")
    return cfg_path


def fractions_to_pixels(
    fractions: PanelFractions, client_width: int, client_height: int
) -> dict[str, int]:
    left = int(round(fractions.x * client_width))
    top = int(round(fractions.y * client_height))
    width = max(1, int(round(fractions.width * client_width)))
    height = max(1, int(round(fractions.height * client_height)))
    return {"left": left, "top": top, "width": width, "height": height}
