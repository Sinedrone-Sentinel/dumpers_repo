"""Detect HUD row bands from a frozen RESULTS panel crop (resolution-independent)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from PIL import Image

from composition_parse import (
    COMP_HEADER_RE,
    COMPOSITION_PERCENT_RE,
    HUD_FOOTER_RE,
    HUD_SKIP_RE,
    is_inert_anchor_row,
)
from panel_tesseract import ocr_panel_words

# Must match panel_tesseract._upscale target_height (word boxes live in this space).
_OCR_UPSCALE_TARGET = 2000

MASS_LABEL_RE = re.compile(r"\bMASS\b", re.I)
RES_LABEL_RE = re.compile(r"\bRES\b", re.I)
INST_LABEL_RE = re.compile(r"\bINST\b", re.I)
RESULTS_RE = re.compile(r"\bRESULTS?\b", re.I)
ORE_TAG_RE = re.compile(r"\((?:ORE|RAW)\)|(?:ORE|RAW)\b", re.I)

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
class PanelWordRow:
    y_center: float
    text: str
    y_frac: float


@dataclass
class PanelRowLayout:
    rows: dict[str, float] = field(default_factory=dict)
    panel_height: int = 1

    def y_frac(self, row_id: str) -> float:
        return self.rows.get(row_id, _FALLBACK.get(row_id, 0.5))


def _ocr_word_space_height(panel_height: int) -> int:
    """Height of the image Tesseract word boxes are measured against."""
    return max(panel_height, _OCR_UPSCALE_TARGET)


def _cluster_word_rows(
    words: list[dict[str, int | str]], ocr_height: int
) -> list[PanelWordRow]:
    if not words:
        return []

    tolerance = max(8, int(ocr_height * 0.028))
    sorted_words = sorted(words, key=lambda w: (int(w["y0"]) + int(w["y1"])) / 2)
    clusters: list[list[dict[str, int | str]]] = []

    for word in sorted_words:
        y_center = (int(word["y0"]) + int(word["y1"])) / 2
        if not clusters:
            clusters.append([word])
            continue
        last_cluster = clusters[-1]
        last_y = sum((int(w["y0"]) + int(w["y1"])) / 2 for w in last_cluster) / len(
            last_cluster
        )
        if y_center - last_y <= tolerance:
            last_cluster.append(word)
        else:
            clusters.append([word])

    rows: list[PanelWordRow] = []
    for cluster in clusters:
        y_center = sum((int(w["y0"]) + int(w["y1"])) / 2 for w in cluster) / len(cluster)
        text = " ".join(
            str(w["text"])
            for w in sorted(cluster, key=lambda w: int(w["x0"]))
        )
        rows.append(
            PanelWordRow(
                y_center=y_center,
                text=text,
                y_frac=y_center / max(1, ocr_height),
            )
        )
    return rows


def _row_index(rows: list[PanelWordRow], pattern: re.Pattern[str]) -> int | None:
    for index, row in enumerate(rows):
        if pattern.search(row.text):
            return index
    return None


def _is_composition_row(text: str) -> bool:
    if not COMPOSITION_PERCENT_RE.search(text):
        return False
    if is_inert_anchor_row(text):
        return False
    if HUD_SKIP_RE.search(text) and not COMPOSITION_PERCENT_RE.search(text):
        return False
    return True


def detect_panel_row_layout(panel_img: Image.Image) -> PanelRowLayout:
    """
    Map checkmark row ids to y fractions inside the panel crop.

    Positions come from word boxes on *this* frozen grab, not a fixed monitor layout.
    """
    panel_height = max(1, panel_img.height)
    ocr_height = _ocr_word_space_height(panel_height)
    words = ocr_panel_words(panel_img)
    rows = _cluster_word_rows(words, ocr_height)
    layout: dict[str, float] = {}

    mass_idx = _row_index(rows, MASS_LABEL_RE)
    res_idx = _row_index(rows, RES_LABEL_RE)
    inst_idx = _row_index(rows, INST_LABEL_RE)
    comp_idx = _row_index(rows, COMP_HEADER_RE)

    if mass_idx is not None:
        layout["mass"] = rows[mass_idx].y_frac
        for index in range(mass_idx - 1, -1, -1):
            text = rows[index].text
            if RESULTS_RE.search(text):
                continue
            if HUD_FOOTER_RE.search(text):
                continue
            if MASS_LABEL_RE.search(text) or RES_LABEL_RE.search(text):
                continue
            layout["ore"] = rows[index].y_frac
            break

    if res_idx is not None:
        layout["res"] = rows[res_idx].y_frac
    if inst_idx is not None:
        layout["inst"] = rows[inst_idx].y_frac
    if comp_idx is not None:
        layout["comp_scu"] = rows[comp_idx].y_frac

    inert_idx: int | None = None
    if comp_idx is not None:
        for index in range(comp_idx + 1, len(rows)):
            if HUD_FOOTER_RE.search(rows[index].text):
                break
            if is_inert_anchor_row(rows[index].text):
                inert_idx = index
        comp_line = 0
        for index in range(comp_idx + 1, inert_idx or len(rows)):
            if inert_idx is not None and index >= inert_idx:
                break
            if HUD_FOOTER_RE.search(rows[index].text):
                break
            if _is_composition_row(rows[index].text):
                layout[f"comp_{comp_line}"] = rows[index].y_frac
                comp_line += 1
        if inert_idx is not None:
            layout["inert"] = rows[inert_idx].y_frac

    # Ore fallback: first (ORE) row above composition block.
    if "ore" not in layout:
        search_end = comp_idx if comp_idx is not None else len(rows)
        for index in range(search_end):
            if ORE_TAG_RE.search(rows[index].text) and not MASS_LABEL_RE.search(rows[index].text):
                layout["ore"] = rows[index].y_frac
                break

    return PanelRowLayout(rows=layout, panel_height=panel_height)
