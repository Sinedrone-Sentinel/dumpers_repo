"""Parse RES / resistance from RESULTS panel Tesseract lines (calculator-critical)."""

from __future__ import annotations

import re

MAX_RESISTANCE_PERCENT = 100.0

_MASS_ROW_RE = re.compile(r"\bMASS\b", re.I)
_INST_ROW_RE = re.compile(r"\bINST(?:ABILITY)?\b", re.I)
_COMP_HEADER_RE = re.compile(r"\b(?:COMP|CONP)(?:OSITION)?\.?", re.I)
_COMPOSITION_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")


def _is_res_row(row: str) -> bool:
    if re.search(r"\bRESULTS?\b", row, re.I) and not re.search(
        r"(?:^|\s)RES\s*[:./\\-]", row, re.I
    ):
        return False
    if re.search(r"\bRESISTANCE\b", row, re.I):
        return True
    if re.search(r"(?:^|\s)RES\s*[:./\\-]", row, re.I):
        return True
    letters = re.sub(r"[^A-Za-z]", "", row).upper()
    if not letters or letters.startswith("RESULT"):
        return False
    return letters.startswith(("RESISTANCE", "RES", "RST", "RE5"))


def _res_row_indicates_zero(row: str, next_row: str | None = None) -> bool:
    block = " ".join(part for part in (row, next_row) if part).strip()
    if not _is_res_row(row) and not re.search(r"\bRES(?:ISTANCE)?\b", block, re.I):
        return False
    if re.search(r"\bRES(?:ISTANCE)?\b[^0-9\n]{0,20}[O0D](?:\s*%|\s+0\s*%)", block, re.I):
        return True
    if re.search(r"\bRES(?:ISTANCE)?\b[^0-9\n]{0,20}0(?:\.0+)?\s*%", block, re.I):
        return True
    if re.search(r"\bRES(?:ISTANCE)?\b[^0-9\n]{0,20}%\s*0", block, re.I):
        return True
    return False


def _normalize_res_token(token: str) -> float | None:
    if re.fullmatch(r"[O0D]", token, re.I):
        return 0.0
    try:
        value = float(token)
    except ValueError:
        return None
    if not (0 <= value <= MAX_RESISTANCE_PERCENT):
        return None
    # Oval zero on HUD often OCRs as 2 or 3 on low-RES rocks.
    if value in (2, 3):
        return 0.0
    return value


def parse_resistance_from_res_row(row: str, next_row: str | None = None) -> float | None:
    """RES line often shows `0%`; OCR misreads the oval zero as 2, 3, or O."""
    if _res_row_indicates_zero(row, next_row):
        return 0.0

    block = " ".join(part for part in (row, next_row) if part).strip()
    if not _is_res_row(row) and not re.search(r"\bRES(?:ISTANCE)?\b", block, re.I):
        return None

    spaced = re.search(r"\bRES(?:ISTANCE)?\b\s*[:.]?\s*(\d)\s+(\d)\s*%", block, re.I)
    if spaced:
        value = int(f"{spaced.group(1)}{spaced.group(2)}")
        if 0 <= value <= MAX_RESISTANCE_PERCENT:
            return float(value)

    glued = re.search(r"\bRES(?:ISTANCE)?\b\s*[:.]?\s*(\d{1,3})\s*%", block, re.I)
    if glued:
        normalized = _normalize_res_token(glued.group(1))
        if normalized is not None:
            return normalized

    suffix = re.sub(r"^.*?\bRES(?:ISTANCE)?\b\s*[:./\\-]?\s*", "", block, flags=re.I).strip()
    if suffix:
        leading = re.match(r"^([O0D]|\d{1,3})(?:\.\d+)?\s*%?", suffix, re.I)
        if leading:
            normalized = _normalize_res_token(leading.group(1))
            if normalized is not None:
                return normalized

    return None


def _panel_stat_slice(lines: list[str]) -> list[str]:
    mass_idx = next((i for i, row in enumerate(lines) if _MASS_ROW_RE.search(row)), -1)
    comp_idx = next(
        (
            i
            for i, row in enumerate(lines)
            if _COMP_HEADER_RE.search(row) or _COMPOSITION_PERCENT_RE.search(row)
        ),
        len(lines),
    )
    if mass_idx < 0:
        return lines
    return lines[mass_idx:comp_idx]


def extract_resistance_by_position(lines: list[str]) -> float | None:
    """HUD order between MASS and COMP: RES then INST — first stat row is resistance."""
    mass_idx = next((i for i, row in enumerate(lines) if _MASS_ROW_RE.search(row)), -1)
    comp_idx = next(
        (
            i
            for i, row in enumerate(lines)
            if _COMP_HEADER_RE.search(row) or _COMPOSITION_PERCENT_RE.search(row)
        ),
        len(lines),
    )
    if mass_idx < 0:
        return None

    for index in range(mass_idx + 1, comp_idx):
        row = lines[index]
        if _COMPOSITION_PERCENT_RE.search(row):
            continue
        if _is_res_row(row):
            next_row = lines[index + 1] if index + 1 < comp_idx else None
            parsed = parse_resistance_from_res_row(row, next_row)
            if parsed is not None:
                return parsed
        if _INST_ROW_RE.search(row):
            break

    return None


def best_resistance_from_lines(lines: list[str]) -> float | None:
    """Resistance from RESULTS panel OCR — preferred over full-frame SC_OCR."""
    positional = extract_resistance_by_position(lines)
    if positional is not None:
        return positional

    for index, line in enumerate(lines):
        if not _is_res_row(line):
            continue
        next_row = lines[index + 1] if index + 1 < len(lines) else None
        if _res_row_indicates_zero(line, next_row):
            return 0.0
        parsed = parse_resistance_from_res_row(line, next_row)
        if parsed is not None:
            return parsed

    slice_lines = _panel_stat_slice(lines)
    corpus = "\n".join(slice_lines)
    for pattern in (
        r"\bRESISTANCE\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)\s*%?",
        r"\bRE5\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)\s*%?",
        r"(?:^|\s)RES(?![A-Z])\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)\s*%?",
        r"\bRST\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)\s*%?",
    ):
        match = re.search(pattern, corpus, re.I | re.M)
        if not match:
            continue
        token = match.group(1).replace(",", "")
        normalized = _normalize_res_token(token)
        if normalized is not None:
            return normalized

    return None


def best_resistance_from_candidates(
    candidates: list[tuple[str, list[str]]] | None,
    merged_lines: list[str],
) -> float | None:
    """Multi-pass RES read — never fall back to SC_OCR noise like 47%."""
    values: list[float] = []
    saw_res_row = False
    saw_zero_indicator = False

    for _ocr_pass, lines in candidates or []:
        for index, line in enumerate(lines):
            if _is_res_row(line):
                saw_res_row = True
                next_row = lines[index + 1] if index + 1 < len(lines) else None
                if _res_row_indicates_zero(line, next_row):
                    saw_zero_indicator = True
        parsed = best_resistance_from_lines(lines)
        if parsed is not None:
            values.append(parsed)

    if not values and merged_lines:
        parsed = best_resistance_from_lines(merged_lines)
        if parsed is not None:
            values.append(parsed)
        for index, line in enumerate(merged_lines):
            if _is_res_row(line):
                saw_res_row = True
                next_row = merged_lines[index + 1] if index + 1 < len(merged_lines) else None
                if _res_row_indicates_zero(line, next_row):
                    saw_zero_indicator = True

    if saw_zero_indicator:
        return 0.0
    if 0.0 in values:
        return 0.0
    if values:
        # Low-RES rocks are common; prefer the lowest plausible panel read.
        return min(values)

    if saw_res_row:
        return 0.0

    return None
