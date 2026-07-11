"""Fill SC_OCR / composition gaps from panel line OCR on the frozen crop."""

from __future__ import annotations

import re

from PIL import Image

from composition_parse import COMP_HEADER_RE, MAX_COMP_SCU
from ore_canonical import is_known_rs_ore, resolve_ocr_ore_name
from panel_ore_parse import resolve_primary_ore_name
from panel_res_parse import best_resistance_from_lines
from panel_tesseract import merge_line_candidates, ocr_panel_line_candidates

_MASS_RE = re.compile(r"\bMASS\b[:\s]*([\d,]+(?:\.\d+)?)", re.I)
_RESULTS_RE = re.compile(r"\bRESULTS?\b", re.I)
ROCK_MASS_MIN = 1_000
ROCK_MASS_MAX = 999_999
_INST_RE = re.compile(r"\bINST\b[:\s]*(\d+(?:\.\d+)?)", re.I)
_ORE_NAME_RE = re.compile(
    r"^([A-Za-z][A-Za-z0-9_\s-]*?)\s*\((?:ORE|RAW)\)",
    re.I,
)
_SCU_ON_COMP_RE = re.compile(
    r"\b(?:COMP|CONP)(?:OSITION)?\.?\b",
    re.I,
)


def _merged_panel_lines(
    panel_img: Image.Image,
    *,
    line_candidates: list[tuple[str, list[str]]] | None = None,
) -> list[str]:
    candidates = line_candidates or ocr_panel_line_candidates(panel_img)
    return merge_line_candidates(candidates)


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


def _best_mass_from_lines(lines: list[str]) -> float | None:
    best: float | None = None
    best_score = -1
    for line in lines:
        match = _MASS_RE.search(line)
        if not match:
            continue
        value = _parse_number(match.group(1))
        if not (ROCK_MASS_MIN <= value <= ROCK_MASS_MAX):
            continue
        score = 0
        if _RESULTS_RE.search(line):
            score += 25
        if value <= 300_000:
            score += 8
        if value <= 100_000:
            score += 4
        if best is None or score > best_score or (score == best_score and value < best):
            best_score = score
            best = value
    return best


def enrich_sc_ocr_from_panel(
    sc_ocr: dict,
    panel_img: Image.Image,
    *,
    line_candidates: list[tuple[str, list[str]]] | None = None,
) -> dict:
    """Patch missing SC_OCR fields using Tesseract lines from the frozen panel."""
    enriched = dict(sc_ocr)
    lines = _merged_panel_lines(panel_img, line_candidates=line_candidates)

    panel_mass = _best_mass_from_lines(lines)
    sc_mass = enriched.get("mass")
    if panel_mass is not None:
        if sc_mass is None or abs(sc_mass - panel_mass) / max(panel_mass, 1) > 0.15:
            enriched["mass"] = panel_mass
    elif enriched.get("mass") is None:
        for line in lines:
            match = _MASS_RE.search(line)
            if match:
                enriched["mass"] = _parse_number(match.group(1))
                break

    panel_res = best_resistance_from_lines(lines)
    if panel_res is not None:
        enriched["resistance"] = panel_res

    if enriched.get("instability") is None:
        for line in lines:
            match = _INST_RE.search(line)
            if match:
                enriched["instability"] = float(match.group(1))
                break

    mineral = (enriched.get("mineral_name") or "").strip()
    if mineral:
        resolved = resolve_ocr_ore_name(mineral)
        enriched["mineral_name"] = resolved if is_known_rs_ore(resolved) else None

    if not enriched.get("mineral_name"):
        for line in lines:
            match = _ORE_NAME_RE.search(line.strip())
            if match:
                name = match.group(1).strip()
                if name and not name.isdigit():
                    resolved = resolve_ocr_ore_name(name)
                    if is_known_rs_ore(resolved):
                        enriched["mineral_name"] = resolved
                        break

    if not enriched.get("mineral_name"):
        panel_primary = resolve_primary_ore_name(lines, [])
        if panel_primary:
            enriched["mineral_name"] = panel_primary

    if not enriched.get("panel_visible"):
        if enriched.get("mass") is not None or _SCU_ON_COMP_RE.search("\n".join(lines)):
            enriched["panel_visible"] = True

    return enriched


def enrich_composition_from_panel(
    composition: dict,
    panel_img: Image.Image,
    *,
    line_candidates: list[tuple[str, list[str]]] | None = None,
) -> dict:
    """Patch missing COMP SCU total from panel line OCR."""
    enriched = dict(composition)
    if enriched.get("total_scu") is not None:
        return enriched

    for line in _merged_panel_lines(panel_img, line_candidates=line_candidates):
        value = _scu_from_comp_line(line)
        if value is not None:
            enriched["total_scu"] = value
            warnings = list(enriched.get("warnings") or [])
            warnings.append("COMP SCU read from panel line OCR fallback.")
            enriched["warnings"] = warnings
            break

    return enriched
