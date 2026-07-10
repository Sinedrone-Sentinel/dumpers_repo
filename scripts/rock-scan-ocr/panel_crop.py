"""Panel crop helpers."""

from __future__ import annotations

from dataclasses import dataclass

REFERENCE_DISPLAY = (2560, 1440)
REFERENCE_PANEL = (382, 549)
REFERENCE_CROP_ORIGIN = (2170, 115)


@dataclass(frozen=True)
class PanelFractions:
    x: float
    y: float
    width: float
    height: float

    def as_dict(self) -> dict[str, float]:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
        }


def default_panel_fractions() -> PanelFractions:
    """Legacy browser paste-crop reference (2560×1440)."""
    width = REFERENCE_PANEL[0] / REFERENCE_DISPLAY[0]
    height = REFERENCE_PANEL[1] / REFERENCE_DISPLAY[1]
    y = REFERENCE_CROP_ORIGIN[1] / REFERENCE_DISPLAY[1]
    right_margin = (
        REFERENCE_DISPLAY[0] - REFERENCE_CROP_ORIGIN[0] - REFERENCE_PANEL[0]
    ) / REFERENCE_DISPLAY[0]
    x = 1.0 - width - right_margin
    x = min(max(x, 0.0), 1.0 - width)
    y = min(max(y, 0.0), 1.0 - height)
    return PanelFractions(x=x, y=y, width=width, height=height)


def panel_pixels_from_fractions(
    fractions: PanelFractions, client_w: int, client_h: int
) -> dict[str, int]:
    left = int(round(fractions.x * client_w))
    top = int(round(fractions.y * client_h))
    width = max(1, int(round(fractions.width * client_w)))
    height = max(1, int(round(fractions.height * client_h)))
    return {"left": left, "top": top, "width": width, "height": height}
