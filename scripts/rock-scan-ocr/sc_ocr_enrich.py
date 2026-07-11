"""Fill SC_OCR gaps from panel line OCR when the HUD still shows the value."""

from __future__ import annotations

import re

from PIL import Image

from panel_tesseract import ocr_panel_lines

_RES_RE = re.compile(r"\bRES\b[:\s]*(\d+(?:\.\d+)?)\s*%?", re.I)


def enrich_sc_ocr_from_panel(sc_ocr: dict, panel_img: Image.Image) -> dict:
    """Patch missing SC_OCR fields using Tesseract lines from the frozen panel."""
    enriched = dict(sc_ocr)
    if enriched.get("resistance") is not None:
        return enriched

    for line in ocr_panel_lines(panel_img):
        match = _RES_RE.search(line)
        if match:
            enriched["resistance"] = float(match.group(1))
            break

    return enriched
