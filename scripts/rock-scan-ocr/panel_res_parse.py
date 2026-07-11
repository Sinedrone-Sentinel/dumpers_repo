"""Parse RES / resistance from RESULTS panel Tesseract lines (calculator-critical)."""

from __future__ import annotations

import re

MAX_RESISTANCE_PERCENT = 100.0


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
    block = " ".join(part for part in (row, next_row) if part).strip()
    if not _is_res_row(row) and not re.search(r"\bRES(?:ISTANCE)?\b", block, re.I):
        return None

    if re.search(r"\bRES(?:ISTANCE)?\b[^0-9\n]{0,16}0(?:\.0+)?\s*%", block, re.I):
        return 0.0
    if re.search(r"\bRES(?:ISTANCE)?\b[^0-9\n]{0,16}[O0D](?:\s*%|\s+0\s*%)", block, re.I):
        return 0.0

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


def best_resistance_from_lines(lines: list[str]) -> float | None:
    """Resistance from RESULTS panel OCR — preferred over full-frame SC_OCR."""
    for index, line in enumerate(lines):
        if not _is_res_row(line):
            continue
        next_row = lines[index + 1] if index + 1 < len(lines) else None
        parsed = parse_resistance_from_res_row(line, next_row)
        if parsed is not None:
            return parsed

    corpus = "\n".join(lines)
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
