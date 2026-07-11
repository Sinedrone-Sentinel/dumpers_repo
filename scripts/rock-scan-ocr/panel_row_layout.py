"""Detect HUD row bands from a frozen RESULTS panel crop (resolution-independent)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from PIL import Image

from composition_parse import (
    COMP_HEADER_RE,
    COMPOSITION_PERCENT_RE,
    HUD_FOOTER_RE,
    is_inert_anchor_row,
)
from panel_tesseract import ocr_panel_lines_fast

MASS_LABEL_RE = re.compile(r"\bMASS\b", re.I)
RES_LABEL_RE = re.compile(r"\bRES\b", re.I)
INST_LABEL_RE = re.compile(r"\bINST\b", re.I)
RESULTS_RE = re.compile(r"\bRESULTS?\b", re.I)
ORE_TAG_RE = re.compile(r"\((?:ORE|RAW)\)|(?:ORE|RAW)\b", re.I)
COMP_LINE_RE = re.compile(r"^comp_\d+$")

# Last-resort bands inside the panel crop (not tied to any monitor).
_FALLBACK: dict[str, float] = {
    "ore": 0.10,
    "mass": 0.19,
    "res": 0.26,
    "inst": 0.33,
    "comp_scu": 0.42,
    "comp_0": 0.57,
    "comp_1": 0.65,
    "inert": 0.73,
}


@dataclass
class PanelRowLayout:
    rows: dict[str, float] = field(default_factory=dict)
    panel_height: int = 1

    def y_frac(self, row_id: str) -> float:
        return self.rows.get(row_id, _FALLBACK.get(row_id, 0.5))


def _line_y_frac(index: int, total: int) -> float:
    if total <= 0:
        return 0.5
    return (index + 0.5) / total


def _line_index(lines: list[str], pattern: re.Pattern[str]) -> int | None:
    for index, line in enumerate(lines):
        if pattern.search(line):
            return index
    return None


def _is_composition_row(text: str) -> bool:
    if not COMPOSITION_PERCENT_RE.search(text):
        return False
    if is_inert_anchor_row(text):
        return False
    return True


def detect_panel_row_layout(panel_img: Image.Image) -> PanelRowLayout:
    """
    Map checkmark row ids to y fractions inside the panel crop.

    Uses one fast line OCR pass (not word boxes) so marker alignment does not
    block the scan overlay. Row bands stay at detected line positions — we do
    not nudge markers vertically (that looked like the green box was shifting).
    """
    panel_height = max(1, panel_img.height)
    lines = ocr_panel_lines_fast(panel_img)
    if not lines:
        return PanelRowLayout(rows={}, panel_height=panel_height)

    total = len(lines)
    layout: dict[str, float] = {}

    mass_idx = _line_index(lines, MASS_LABEL_RE)
    res_idx = _line_index(lines, RES_LABEL_RE)
    inst_idx = _line_index(lines, INST_LABEL_RE)
    comp_idx = _line_index(lines, COMP_HEADER_RE)

    if mass_idx is not None:
        layout["mass"] = _line_y_frac(mass_idx, total)
        for index in range(mass_idx - 1, -1, -1):
            text = lines[index]
            if RESULTS_RE.search(text):
                continue
            if HUD_FOOTER_RE.search(text):
                continue
            if MASS_LABEL_RE.search(text) or RES_LABEL_RE.search(text):
                continue
            layout["ore"] = _line_y_frac(index, total)
            break

    if res_idx is not None:
        layout["res"] = _line_y_frac(res_idx, total)
    if inst_idx is not None:
        layout["inst"] = _line_y_frac(inst_idx, total)
    if comp_idx is not None:
        layout["comp_scu"] = _line_y_frac(comp_idx, total)

    inert_idx: int | None = None
    if comp_idx is not None:
        for index in range(comp_idx + 1, total):
            if HUD_FOOTER_RE.search(lines[index]):
                break
            if is_inert_anchor_row(lines[index]):
                inert_idx = index
                break
        comp_line = 0
        for index in range(comp_idx + 1, inert_idx or total):
            if inert_idx is not None and index >= inert_idx:
                break
            if HUD_FOOTER_RE.search(lines[index]):
                break
            if _is_composition_row(lines[index]):
                layout[f"comp_{comp_line}"] = _line_y_frac(index, total)
                comp_line += 1
        if inert_idx is not None:
            layout["inert"] = _line_y_frac(inert_idx, total)

    if "ore" not in layout:
        search_end = comp_idx if comp_idx is not None else total
        for index in range(search_end):
            if ORE_TAG_RE.search(lines[index]) and not MASS_LABEL_RE.search(lines[index]):
                layout["ore"] = _line_y_frac(index, total)
                break

    return PanelRowLayout(rows=layout, panel_height=panel_height)
