"""Resolve primary ore from RESULTS panel lines (mirrors site rockCalculatorOcrParse)."""

from __future__ import annotations

import re

from composition_parse import COMPOSITION_PERCENT_RE, HUD_SKIP_RE
from ore_canonical import is_known_rs_ore, resolve_ocr_ore_name

_MASS_RE = re.compile(r"\bMASS\b", re.I)
_RES_RE = re.compile(r"\bRES(?:ISTANCE)?\b", re.I)
_INST_RE = re.compile(r"\bINST(?:ABILITY)?\b", re.I)
_RESULTS_RE = re.compile(r"\bRESULTS?\b", re.I)
_COMP_HEADER_RE = re.compile(r"\b(?:COMP|CONP)(?:OSITION)?\.?", re.I)
_ORE_TAG_RE = re.compile(r"\((?:ORE|RAW)\)|(?:ORE|RAW)\b", re.I)

_HUD_LABEL_WORDS = frozenset(
    {
        "MASS",
        "RES",
        "RESISTANCE",
        "INS",
        "INST",
        "INSTABILITY",
        "COMPOSITION",
        "COMP",
        "DISTANCE",
        "LOCK",
        "TARG",
        "AUTO",
        "CARGO",
        "SCAN",
        "RESULTS",
        "RESULT",
    }
)


def _is_mass_row(row: str) -> bool:
    return bool(_MASS_RE.search(row))


def _row_has_hud_stat_label(row: str) -> bool:
    return bool(
        _MASS_RE.search(row)
        or _RES_RE.search(row)
        or _INST_RE.search(row)
        or (_COMP_HEADER_RE.search(row) and re.search(r"\bSCU\b", row, re.I))
        or _COMP_HEADER_RE.search(row)
    )


def _is_composition_percent_row(row: str) -> bool:
    if _row_has_hud_stat_label(row):
        return False
    return bool(COMPOSITION_PERCENT_RE.search(row))


def _parse_ore_name_from_row(row: str) -> str | None:
    trimmed = row.strip()
    if not trimmed:
        return None

    ore_tagged = re.match(r"^([A-Za-z][A-Za-z0-9\s]*?)\s*\((?:ORE|RAW)\)", trimmed, re.I)
    if ore_tagged:
        return resolve_ocr_ore_name(ore_tagged.group(1).strip())

    rock_tagged = re.match(r"^([A-Za-z][A-Za-z0-9]*)\s+ROCK", trimmed, re.I)
    if rock_tagged:
        return resolve_ocr_ore_name(rock_tagged.group(1))

    plain = re.match(r"^([A-Za-z][A-Za-z0-9]{2,})", trimmed)
    if plain:
        token = plain.group(1).upper()
        if token in _HUD_LABEL_WORDS:
            return None
        resolved = resolve_ocr_ore_name(plain.group(1))
        if is_known_rs_ore(resolved):
            return resolved
        return None

    return None


def resolve_primary_ore_name(
    rows: list[str],
    composition_lines: list[dict],
) -> str | None:
    """Prefer IRON (ORE) above MASS; fall back to composition bands — never trust SC_OCR garbage."""
    mass_index = next((i for i, row in enumerate(rows) if _is_mass_row(row)), -1)

    if mass_index >= 0:
        for index in range(mass_index):
            if _RESULTS_RE.search(rows[index]):
                continue
            ore_name = _parse_ore_name_from_row(rows[index])
            if ore_name and is_known_rs_ore(ore_name):
                return ore_name

    for row in rows:
        if _RESULTS_RE.search(row):
            continue
        if _row_has_hud_stat_label(row) or _is_composition_percent_row(row):
            continue
        if HUD_SKIP_RE.search(row) and not _ORE_TAG_RE.search(row):
            continue
        ore_name = _parse_ore_name_from_row(row)
        if ore_name and is_known_rs_ore(ore_name):
            return ore_name

    band_counts: dict[str, int] = {}
    for line in composition_lines:
        name = line.get("elementName") or line.get("element_name") or ""
        if not name or name.lower() == "inert":
            continue
        canonical = resolve_ocr_ore_name(name)
        if not is_known_rs_ore(canonical):
            continue
        band_counts[canonical] = band_counts.get(canonical, 0) + 1

    best: str | None = None
    best_count = 0
    for name, count in band_counts.items():
        if count >= 2 and count > best_count:
            best = name
            best_count = count
    if best:
        return best

    valuable = [
        line
        for line in composition_lines
        if (line.get("elementName") or line.get("element_name") or "").lower() != "inert"
    ]
    if valuable:
        top = max(
            valuable,
            key=lambda line: float(line.get("percent") or 0),
        )
        name = top.get("elementName") or top.get("element_name") or ""
        canonical = resolve_ocr_ore_name(name)
        if is_known_rs_ore(canonical):
            return canonical

    return None
