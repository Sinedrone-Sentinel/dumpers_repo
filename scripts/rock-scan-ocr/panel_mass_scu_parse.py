"""MASS and COMP SCU parsing from RESULTS panel OCR (calculator-critical)."""

from __future__ import annotations

import re

from panel_digit_normalize import (
    extract_mass_tokens_from_line,
    vote_decimal_string,
    vote_digit_string,
    vote_mass_tokens,
)

MIN_ROCK_SCANNER_MASS = 1_000
MAX_ROCK_SCANNER_MASS = 999_999
MAX_COMP_SCU = 80.0
MIN_COMP_SCU = 0.5

_MASS_ROW_RE = re.compile(r"\bMASS\b", re.I)
_MASS_LABEL_RE = re.compile(r"\bM[A4@]SS\b", re.I)
_COMP_HEADER_RE = re.compile(r"\b(?:COMP|CONP)(?:OSITION)?\.?", re.I)
_CARGO_RE = re.compile(r"\bCARGO\b", re.I)
_COMPOSITION_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")


def is_plausible_scanner_mass(value: float) -> bool:
    return MIN_ROCK_SCANNER_MASS <= value <= MAX_ROCK_SCANNER_MASS


def is_plausible_rock_total_scu(value: float) -> bool:
    return MIN_COMP_SCU <= value <= MAX_COMP_SCU


def _parse_number_token(token: str) -> float | None:
    cleaned = token.replace(",", "").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _all_integers_in_row(row: str) -> list[int]:
    values: list[int] = []
    for match in re.finditer(r"\b(\d{3,6})\b", row):
        try:
            values.append(int(match.group(1)))
        except ValueError:
            continue
    return values


def pick_best_mass_candidate(candidates: list[float]) -> int | None:
    plausible = [int(round(value)) for value in candidates if is_plausible_scanner_mass(value)]
    if not plausible:
        return None
    voted = vote_digit_string([str(value) for value in plausible])
    if voted is not None:
        try:
            voted_int = int(voted)
            if is_plausible_scanner_mass(voted_int):
                return voted_int
        except ValueError:
            pass
    return max(plausible)


def collect_mass_tokens_from_candidates(
    candidates: list[tuple[str, list[str]]],
) -> list[str]:
    tokens: list[str] = []
    for _ocr_pass, lines in candidates:
        for row in lines:
            if not _is_mass_row(row):
                continue
            tokens.extend(extract_mass_tokens_from_line(row))
    return tokens


def extract_mass_from_block(block: str) -> int | None:
    """Join split OCR mass (e.g. 7 850) and prefer 4–6 digit reads on the MASS block."""
    candidates: list[float] = []

    for match in re.finditer(r"\b(\d{4,6})\b", block):
        value = int(match.group(1))
        if is_plausible_scanner_mass(value):
            candidates.append(float(value))

    for match in re.finditer(r"\b(\d{1,3})\s+(\d{3,5})\b", block):
        combined = f"{match.group(1)}{match.group(2)}"
        if len(combined) < 4 or len(combined) > 6:
            continue
        value = int(combined)
        if is_plausible_scanner_mass(value):
            candidates.append(float(value))

    for value in _all_integers_in_row(block):
        if is_plausible_scanner_mass(value):
            candidates.append(float(value))

    return pick_best_mass_candidate(candidates)


def _is_mass_row(row: str) -> bool:
    return bool(_MASS_ROW_RE.search(row) or _MASS_LABEL_RE.search(row))


def _is_comp_header_row(row: str) -> bool:
    return bool(_COMP_HEADER_RE.search(row))


def _is_composition_percent_row(row: str) -> bool:
    return bool(_COMPOSITION_PERCENT_RE.search(row))


def _last_number_in_row(row: str) -> float | None:
    matches = list(re.finditer(r"-?\d+(?:[.,]\d+)?", row))
    if not matches:
        return None
    return _parse_number_token(matches[-1].group(0))


def _value_from_label_row(row: str, lines: list[str], index: int) -> float | None:
    inline = _last_number_in_row(row)
    if inline is not None:
        return inline
    for next_index in range(index + 1, min(index + 2, len(lines))):
        parsed = _parse_number_token(lines[next_index])
        if parsed is not None:
            return parsed
    return None


def extract_mass_from_lines(lines: list[str]) -> int | None:
    corpus = " ".join(lines)
    candidates: list[float] = []

    for index, row in enumerate(lines):
        if not _is_mass_row(row):
            continue
        block = " ".join(part for part in (row, lines[index + 1] if index + 1 < len(lines) else None, lines[index + 2] if index + 2 < len(lines) else None) if part)
        from_block = extract_mass_from_block(block)
        if from_block is not None:
            candidates.append(float(from_block))
        inline = _value_from_label_row(row, lines, index)
        if inline is not None and is_plausible_scanner_mass(inline):
            candidates.append(inline)

    for pattern in (
        r"\bMASS\s*[:.]?\s*(-?\d[\d,]*\.?\d*)",
        r"\bM[A4@]SS\s*[:.]?\s*(-?\d[\d,]*\.?\d*)",
    ):
        match = re.search(pattern, corpus, re.I)
        if match:
            parsed = _parse_number_token(match.group(1))
            if parsed is not None and is_plausible_scanner_mass(parsed):
                candidates.append(parsed)

    for row in lines:
        if _is_composition_percent_row(row):
            continue
        if _is_mass_row(row) or _COMP_HEADER_RE.search(row):
            continue
        value = _last_number_in_row(row)
        if value is not None and is_plausible_scanner_mass(value):
            candidates.append(value)

    return pick_best_mass_candidate(candidates)


def _all_decimals_in_row(row: str) -> list[float]:
    values: list[float] = []
    for match in re.finditer(r"(\d+\.\d{1,3})", row):
        value = float(match.group(1))
        if value > 0:
            values.append(value)
    return values


def _parse_spaced_scu(row: str) -> float | None:
    spaced_cents = re.search(
        r"\b(?:COMP|CONP)(?:OSITION)?\.?\s*(\d{1,2})\s+(\d{2})\s*SCU",
        row,
        re.I,
    )
    if spaced_cents:
        value = float(f"{spaced_cents.group(1)}.{spaced_cents.group(2)}")
        if is_plausible_rock_total_scu(value):
            return value

    spaced_decimal = re.search(
        r"\b(?:COMP|CONP)(?:OSITION)?\.?\s*(\d{1,2})\s*\.\s*(\d{1,2})\b",
        row,
        re.I,
    )
    if spaced_decimal:
        value = float(f"{spaced_decimal.group(1)}.{spaced_decimal.group(2)}")
        if is_plausible_rock_total_scu(value):
            return value

    glued = re.search(r"\b(?:COMP|CONP)(?:OSITION)?\.?\s*(\d{3,4})\s*SCU", row, re.I)
    if glued:
        digits = glued.group(1)
        if len(digits) == 3:
            value = float(f"{digits[0]}.{digits[1:]}")
            if is_plausible_rock_total_scu(value):
                return value
        if len(digits) == 4:
            value = float(f"{digits[:2]}.{digits[2:]}")
            if is_plausible_rock_total_scu(value):
                return value

    return None


def _collect_scu_candidates_from_lines(lines: list[str]) -> list[float]:
    """Gather every plausible COMP SCU read from a single OCR pass."""
    corpus = " ".join(lines)
    candidates: list[float] = []

    for row in lines:
        if _CARGO_RE.search(row):
            continue
        if not _is_comp_header_row(row) and not re.search(r"\bCOMP\b", row, re.I):
            continue

        spaced = _parse_spaced_scu(row)
        if spaced is not None:
            candidates.append(spaced)

        comp_decimal = re.search(
            r"\b(?:COMP|CONP)(?:OSITION)?\.?\s*(\d+\.\d{1,2})\b",
            row,
            re.I,
        )
        if comp_decimal:
            value = float(comp_decimal.group(1))
            if is_plausible_rock_total_scu(value):
                candidates.append(value)

        tagged = re.search(
            r"\b(?:COMP|CONP)(?:OSITION)?\.?\s*(\d+(?:\.\d+)?)",
            row,
            re.I,
        )
        if tagged:
            value = float(tagged.group(1))
            if is_plausible_rock_total_scu(value):
                candidates.append(value)

        for value in _all_decimals_in_row(row):
            if is_plausible_rock_total_scu(value):
                candidates.append(value)

        last = _last_number_in_row(row)
        if last is not None and is_plausible_rock_total_scu(last):
            candidates.append(last)

    for row in lines:
        if _CARGO_RE.search(row) or _is_composition_percent_row(row):
            continue
        if not re.search(r"\bSCU\b", row, re.I):
            continue
        scu_decimal = re.search(r"(\d+\.\d{1,2})\s*SCU", row, re.I)
        if scu_decimal:
            value = float(scu_decimal.group(1))
            if is_plausible_rock_total_scu(value):
                candidates.append(value)

    for pattern in (
        r"\b(?:COMP|CONP)(?:OSITION)?\.?\s*(\d+(?:\.\d+)?)",
        r"(\d+(?:\.\d+)?)\s*SCU",
    ):
        match = re.search(pattern, corpus, re.I)
        if not match:
            continue
        value = float(match.group(1))
        if is_plausible_rock_total_scu(value):
            candidates.append(value)

    return candidates


def try_fix_scu_decimal_reading(value: float, mass: int | None = None) -> float:
    """8↔0 in COMP SCU cents (8.87 misread of 8.07) — skip when mass suffix matches cents."""
    rounded = round(value, 2)
    integer = int(rounded)
    cents = round((rounded - integer) * 100)
    if mass is not None and mass % 100 == cents:
        return rounded

    if 80 <= cents <= 89:
        fixed = round(integer + (cents - 80) / 100, 2)
        if is_plausible_rock_total_scu(fixed):
            return fixed

    return rounded


def pick_best_scu_candidate(
    candidates: list[float],
    *,
    mass: int | None = None,
) -> float | None:
    if not candidates:
        return None

    decimal_strings = [f"{value:.2f}" for value in candidates if abs(value - round(value)) > 0.001]
    if decimal_strings:
        voted = vote_decimal_string(decimal_strings)
        if voted is not None:
            value = float(voted)
            if is_plausible_rock_total_scu(value):
                return try_fix_scu_decimal_reading(value, mass)

    pool = [try_fix_scu_decimal_reading(value, mass) for value in candidates]
    pool = [value for value in pool if value is not None and is_plausible_rock_total_scu(value)]
    if not pool:
        return None

    votes: dict[float, int] = {}
    for value in pool:
        key = round(value, 2)
        votes[key] = votes.get(key, 0) + 1

    return min(votes.keys(), key=lambda key: (-votes[key], key))


def extract_total_scu_from_lines(lines: list[str]) -> float | None:
    """Prefer decimal COMP totals (7.57) over integer misreads (7)."""
    return pick_best_scu_candidate(_collect_scu_candidates_from_lines(lines))


def reconcile_mass_with_total_scu(mass: int | None, total_scu: float | None) -> int | None:
    """When COMP SCU has cents (e.g. 7.57), fix MASS last-two-digit 8↔0 style drift."""
    if mass is None or total_scu is None:
        return mass

    fraction = total_scu - int(total_scu)
    if fraction < 0.01:
        return mass

    scu_suffix = round(fraction * 100)
    if scu_suffix < 10:
        return mass

    mass_str = str(mass)
    if len(mass_str) < 4:
        return mass

    mass_suffix = int(mass_str[-2:])
    if mass_suffix == scu_suffix:
        return mass

    if abs(mass_suffix - scu_suffix) == 10:
        corrected = int(f"{mass_str[:-2]}{scu_suffix:02d}")
        if is_plausible_scanner_mass(corrected):
            return corrected

    return mass


def try_fix_mass_thousands_digit(mass: int, total_scu: float) -> int:
    """8↔0 on the thousands digit when COMP SCU cents disagree with MASS suffix (e.g. 7050 vs 7850 @ 7.57)."""
    fraction = total_scu - int(total_scu)
    if fraction < 0.01:
        return mass

    scu_suffix = round(fraction * 100)
    mass_str = str(mass)
    if len(mass_str) < 4:
        return mass

    mass_suffix = int(mass_str[-2:])
    if mass_suffix == scu_suffix:
        return mass
    if abs(mass_suffix - scu_suffix) > 10:
        return mass

    if mass_str[1] == "0":
        trial = int(f"{mass_str[0]}8{mass_str[2:]}")
        if is_plausible_scanner_mass(trial):
            return trial

    return mass


def finalize_panel_mass(mass: int | None, total_scu: float | None) -> int | None:
    if mass is None:
        return None
    reconciled = reconcile_mass_with_total_scu(mass, total_scu)
    if reconciled is None:
        return None
    if total_scu is not None:
        return try_fix_mass_thousands_digit(reconciled, total_scu)
    return reconciled


def best_mass_from_candidates(
    candidates: list[tuple[str, list[str]]],
) -> tuple[int | None, str | None]:
    token_lists = []
    per_pass: list[tuple[int | None, str]] = []
    for ocr_pass, lines in candidates:
        row_tokens = []
        for row in lines:
            if _is_mass_row(row):
                row_tokens.extend(extract_mass_tokens_from_line(row))
        token_lists.append(row_tokens)
        value = extract_mass_from_lines(lines)
        per_pass.append((value, ocr_pass))

    voted_mass = vote_mass_tokens(token_lists)
    if voted_mass is not None and is_plausible_scanner_mass(voted_mass):
        for value, ocr_pass in per_pass:
            if value == voted_mass:
                return voted_mass, ocr_pass
        return voted_mass, "digit-vote"

    best: int | None = None
    best_pass: str | None = None
    for value, ocr_pass in per_pass:
        if value is None:
            continue
        if best is None or value > best:
            best = value
            best_pass = ocr_pass
    return best, best_pass


def finalize_panel_scu(total_scu: float | None, mass: int | None = None) -> float | None:
    if total_scu is None:
        return None
    return try_fix_scu_decimal_reading(float(total_scu), mass)


def best_total_scu_from_candidates(
    candidates: list[tuple[str, list[str]]],
    *,
    mass: int | None = None,
) -> tuple[float | None, str | None]:
    all_values: list[float] = []
    source_pass: dict[float, str] = {}
    for ocr_pass, lines in candidates:
        for value in _collect_scu_candidates_from_lines(lines):
            all_values.append(value)
            source_pass.setdefault(value, ocr_pass)

    best = pick_best_scu_candidate(all_values, mass=mass)
    if best is None:
        return None, None
    return best, source_pass.get(best)
