"""Fill SC_OCR / composition gaps from panel line OCR on the frozen crop."""

from __future__ import annotations

import re

from PIL import Image

from composition_parse import COMP_HEADER_RE, MAX_COMP_SCU
from panel_tesseract import ocr_panel_line_candidates

_MASS_RE = re.compile(r"\bMASS\b[:\s]*([\d,]+(?:\.\d+)?)", re.I)
_RES_RE = re.compile(r"\bRES\b[:\s]*(\d+(?:\.\d+)?)\s*%?", re.I)
_INST_RE = re.compile(r"\bINST\b[:\s]*(\d+(?:\.\d+)?)", re.I)
_ORE_NAME_RE = re.compile(
    r"^([A-Za-z][A-Za-z0-9_\s-]*?)\s*\((?:ORE|RAW)\)",
    re.I,
)
_SCU_ON_COMP_RE = re.compile(
    r"\b(?:COMP|CONP)(?:OSITION)?\.?\b",
    re.I,
)


def _merged_panel_lines(panel_img: Image.Image) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for _label, lines in ocr_panel_line_candidates(panel_img):
        for line in lines:
            key = line.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(key)
    return merged


def _parse_number(token: str) -> float:
    return float(token.replace(",", ""))


def _scu_from_comp_line(line: str) -> float | None:
    if not _SCU_ON_COMP_RE.search(line):
        return None
    for decimal in re.findall(r"\d+\.\d{1,2}", line):
        value = float(decimal)
        if 0.5 <= value <= MAX_COMP_SCU:
            return value
    return None


def enrich_sc_ocr_from_panel(sc_ocr: dict, panel_img: Image.Image) -> dict:
    """Patch missing SC_OCR fields using Tesseract lines from the frozen panel."""
    enriched = dict(sc_ocr)
    lines = _merged_panel_lines(panel_img)

    if enriched.get("mass") is None:
        for line in lines:
            match = _MASS_RE.search(line)
            if match:
                enriched["mass"] = _parse_number(match.group(1))
                break

    if enriched.get("resistance") is None:
        for line in lines:
            match = _RES_RE.search(line)
            if match is not None:
                enriched["resistance"] = float(match.group(1))
                break

    if enriched.get("instability") is None:
        for line in lines:
            match = _INST_RE.search(line)
            if match:
                enriched["instability"] = float(match.group(1))
                break

    mineral = (enriched.get("mineral_name") or "").strip()
    if not mineral:
        for line in lines:
            match = _ORE_NAME_RE.search(line.strip())
            if match:
                name = match.group(1).strip()
                if name and not name.isdigit():
                    enriched["mineral_name"] = name
                    break

    if not enriched.get("panel_visible"):
        if enriched.get("mass") is not None or _SCU_ON_COMP_RE.search("\n".join(lines)):
            enriched["panel_visible"] = True

    return enriched


def enrich_composition_from_panel(composition: dict, panel_img: Image.Image) -> dict:
    """Patch missing COMP SCU total from panel line OCR."""
    enriched = dict(composition)
    if enriched.get("total_scu") is not None:
        return enriched

    for line in _merged_panel_lines(panel_img):
        value = _scu_from_comp_line(line)
        if value is not None:
            enriched["total_scu"] = value
            warnings = list(enriched.get("warnings") or [])
            warnings.append("COMP SCU read from panel line OCR fallback.")
            enriched["warnings"] = warnings
            break

    return enriched
