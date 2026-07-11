"""Fill SC_OCR / composition gaps from panel line OCR on the frozen crop."""

from __future__ import annotations

import re

from PIL import Image

from ore_canonical import is_known_rs_ore, resolve_ocr_ore_name
from panel_ore_parse import resolve_primary_ore_name
from panel_mass_scu_parse import (
    best_mass_from_candidates,
    best_total_scu_from_candidates,
    extract_mass_from_lines,
    extract_total_scu_from_lines,
    finalize_panel_mass,
    finalize_panel_scu,
)
from panel_res_parse import best_resistance_from_candidates

_MASS_RE = re.compile(r"\bMASS\b[:\s]*([\d,]+(?:\.\d+)?)", re.I)
_RESULTS_RE = re.compile(r"\bRESULTS?\b", re.I)
_INST_RE = re.compile(r"\bINST\b[:\s]*(\d+(?:\.\d+)?)", re.I)
_ORE_NAME_RE = re.compile(
    r"^([A-Za-z][A-Za-z0-9_\s-]*?)\s*\((?:ORE|RAW)\)",
    re.I,
)
from panel_tesseract import merge_line_candidates, ocr_panel_line_candidates


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


def _best_mass_from_line_candidates(
    line_candidates: list[tuple[str, list[str]]] | None,
    merged_lines: list[str],
) -> int | None:
    if line_candidates:
        panel_mass, _pass = best_mass_from_candidates(line_candidates)
        if panel_mass is not None:
            return panel_mass
    return extract_mass_from_lines(merged_lines)


def enrich_sc_ocr_from_panel(
    sc_ocr: dict,
    panel_img: Image.Image,
    *,
    line_candidates: list[tuple[str, list[str]]] | None = None,
) -> dict:
    """Patch missing SC_OCR fields using Tesseract lines from the frozen panel."""
    enriched = dict(sc_ocr)
    lines = _merged_panel_lines(panel_img, line_candidates=line_candidates)

    panel_mass = _best_mass_from_line_candidates(line_candidates, lines)
    sc_mass = enriched.get("mass")
    if panel_mass is not None:
        if sc_mass is None or abs(sc_mass - panel_mass) / max(panel_mass, 1) > 0.05:
            enriched["mass"] = float(panel_mass)
    elif enriched.get("mass") is None:
        for line in lines:
            match = _MASS_RE.search(line)
            if match:
                enriched["mass"] = _parse_number(match.group(1))
                break

    panel_res = best_resistance_from_candidates(line_candidates, lines)
    if panel_res is not None:
        enriched["resistance"] = panel_res
    else:
        enriched.pop("resistance", None)

    if enriched.get("instability") is not None:
        enriched["instability"] = round(float(enriched["instability"]), 2)
    elif line_candidates or lines:
        for candidate_lines in [lines, *(lines for _, lines in (line_candidates or []))]:
            for index, line in enumerate(candidate_lines):
                if not _INST_RE.search(line):
                    continue
                block = " ".join(
                    part
                    for part in (
                        line,
                        candidate_lines[index + 1] if index + 1 < len(candidate_lines) else None,
                    )
                    if part
                )
                decimal = re.search(r"\bINST\b[:\s]*(\d+\.\d{1,2})", block, re.I)
                if decimal:
                    enriched["instability"] = float(decimal.group(1))
                    break
                whole = re.search(r"\bINST\b[:\s]*(\d{2,3})(?:\s+(\d{2}))?", block, re.I)
                if whole and whole.group(2):
                    enriched["instability"] = float(f"{whole.group(1)}.{whole.group(2)}")
                    break
                if whole:
                    enriched["instability"] = float(whole.group(1))
                    break
            if enriched.get("instability") is not None:
                enriched["instability"] = round(float(enriched["instability"]), 2)
                break

    if enriched.get("instability") is None:
        for line in lines:
            match = _INST_RE.search(line)
            if match:
                enriched["instability"] = round(float(match.group(1)), 2)
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
    panel_mass: int | None = None,
) -> dict:
    """Patch or upgrade COMP SCU total from panel line OCR (prefer decimals over integers)."""
    enriched = dict(composition)
    merged_lines = _merged_panel_lines(panel_img, line_candidates=line_candidates)

    best_scu: float | None = None
    panel_mass_int = int(round(panel_mass)) if panel_mass is not None else None
    if line_candidates:
        best_scu, _pass = best_total_scu_from_candidates(
            line_candidates, mass=panel_mass_int
        )
    if best_scu is None:
        best_scu = extract_total_scu_from_lines(merged_lines)
    best_scu = finalize_panel_scu(best_scu, panel_mass_int)

    current = enriched.get("total_scu")
    if best_scu is not None:
        current_has_fraction = (
            current is not None and abs(float(current) - round(float(current))) > 0.001
        )
        best_has_fraction = abs(best_scu - round(best_scu)) > 0.001
        if current is None or (best_has_fraction and not current_has_fraction) or (
            best_has_fraction == current_has_fraction and abs(best_scu - float(current)) > 0.01
        ):
            enriched["total_scu"] = best_scu
            if current is not None and abs(best_scu - float(current)) > 0.01:
                warnings = list(enriched.get("warnings") or [])
                warnings.append("COMP SCU upgraded from panel OCR pass.")
                enriched["warnings"] = warnings

    if panel_mass is not None and enriched.get("total_scu") is not None:
        finalized = finalize_panel_mass(
            int(round(panel_mass)),
            float(enriched["total_scu"]),
        )
        if finalized is not None:
            enriched["panel_mass_final"] = finalized

    return enriched
