"""Parse composition rows from RESULTS panel OCR text."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from PIL import Image

from panel_tesseract import ocr_panel_line_candidates
from ore_canonical import resolve_ocr_ore_name


@dataclass
class CompositionLine:
    element_name: str
    percent: float
    quality: int | None
    quality_missing: bool
    raw_line: str
    scan_band_rank: int = 0

    def as_dict(self) -> dict:
        return {
            "element_name": self.element_name,
            "percent": self.percent,
            "quality": self.quality,
            "quality_missing": self.quality_missing,
            "scan_band_rank": self.scan_band_rank,
            "raw_line": self.raw_line,
        }


@dataclass
class CompositionParseResult:
    ok: bool
    total_scu: float | None = None
    lines: list[CompositionLine] = field(default_factory=list)
    inert_anchor_line: str | None = None
    inert_anchor_index: int | None = None
    comp_header_index: int | None = None
    ocr_lines: list[str] = field(default_factory=list)
    ocr_pass: str | None = None
    warnings: list[str] = field(default_factory=list)
    error: str | None = None

    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            "total_scu": self.total_scu,
            "inert_anchor_line": self.inert_anchor_line,
            "inert_anchor_index": self.inert_anchor_index,
            "comp_header_index": self.comp_header_index,
            "ocr_pass": self.ocr_pass,
            "lines": [line.as_dict() for line in self.lines],
            "warnings": self.warnings,
            "error": self.error,
            "ocr_line_count": len(self.ocr_lines),
            "ocr_lines": list(self.ocr_lines),
        }


COMP_HEADER_RE = re.compile(r"\b(?:COMP|CONP)(?:OSITION)?\.?", re.I)
COMPOSITION_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
COMPOSITION_WITH_Q_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*%?\s+(.+?)\s+(?:\((?:ORE|RAW)\)|(?:ORE|RAW))\s*(?:Q)?(\d{1,4})\s*$",
    re.I,
)
TOTAL_SCU_RE = re.compile(
    r"\b(?:COMP|CONP)(?:OSITION)?\.?\s*(\d+(?:\.\d+)?)\s*(?:SCU)?\b",
    re.I,
)
EXPLICIT_Q_RE = re.compile(r"\bQ(\d{1,4})\s*$", re.I)
ORE_Q_RE = re.compile(
    r"(?:\((?:ORE|RAW)\)|(?:ORE|RAW))\s*(?:Q)?(\d{1,4})\s*$",
    re.I,
)
TRAILING_Q_LOOSE_RE = re.compile(r"\s+(?:Q)?(\d{1,4})\s*$", re.I)
ORE_TAG_RE = re.compile(r"(?:\((?:ORE|RAW)\)|(?:ORE|RAW))", re.I)
INERT_WORD_RE = re.compile(r"\bINERT\b", re.I)
INERT_FUZZY_RE = re.compile(r"\b(?:INERT|1NERT|INER[T1]|INERTS)\b", re.I)
MATERIALS_RE = re.compile(r"\bMATERIALS?\b", re.I)
MASS_COUNT_TAIL_RE = re.compile(r"\s+\d{1,4}\s*$")

HUD_SKIP_RE = re.compile(
    r"\b(MASS|RES|INST|RESULTS?|CARGO|LOCK|TARG|AUTO|DIFFICULTY)\b",
    re.I,
)
HUD_FOOTER_RE = re.compile(r"\b(CARGO|LOCK|TARG)\b", re.I)

MAX_COMPOSITION_WINDOW = 14
MAX_COMP_SCU = 80.0


def round_percent(value: float) -> float:
    return round(value * 100) / 100


def parse_leading_percent(row: str) -> float | None:
    trimmed = row.strip()
    if not trimmed:
        return None

    patterns = [
        r"^(\d+\.\d{1,2})\s*%",
        r"^(\d{1,2})\s+(\d{2})\s*%",
        r"^(\d{1,2})\s*\.\s*(\d{1,2})\s*%",
        r"^(\d{3,4})\s*%",
        r"^(\d{1,2})\s*%",
    ]
    for pattern in patterns:
        match = re.match(pattern, trimmed, re.I)
        if not match:
            continue
        if len(match.groups()) == 2:
            value = float(f"{match.group(1)}.{match.group(2)}")
        elif len(match.groups()) == 1:
            token = match.group(1)
            if "." in token:
                value = float(token)
            elif len(token) == 3:
                value = float(f"{token[0]}.{token[1:]}")
            elif len(token) == 4:
                value = float(f"{token[:2]}.{token[2:]}")
            else:
                value = float(token)
        else:
            continue
        if 0 < value <= 100:
            return round_percent(value)
    return None


def is_inert_anchor_row(row: str) -> bool:
    if INERT_WORD_RE.search(row) or INERT_FUZZY_RE.search(row):
        return True
    # INERT MATERIALS is the only MATERIALS row on the RESULTS panel.
    if MATERIALS_RE.search(row):
        return True
    return False


def is_composition_percent_row(row: str) -> bool:
    if HUD_SKIP_RE.search(row) and not COMPOSITION_PERCENT_RE.search(row):
        return False
    if is_inert_anchor_row(row):
        return False
    return bool(COMPOSITION_PERCENT_RE.search(row))


def normalize_element_name(raw: str, mineral_hint: str | None = None) -> str:
    text = raw.strip()
    text = MASS_COUNT_TAIL_RE.sub("", text).strip()
    tagged = re.match(r"^(.+?)\s*\((?:ORE|RAW)\)", text, re.I)
    if tagged:
        name = tagged.group(1).strip()
    else:
        name = re.sub(r"\((?:ORE|RAW)\)", "", text, flags=re.I).strip()
    if re.match(r"^inert", name, re.I) or MATERIALS_RE.search(name):
        return "Inert"
    if not name or re.fullmatch(r"(?:ORE|RAW)", name, re.I) or len(name) <= 2:
        if mineral_hint:
            return mineral_hint.title()
    token = re.match(r"^([A-Za-z][A-Za-z0-9]*)", name)
    if token:
        candidate = token.group(1).title()
        if len(candidate) <= 2 and mineral_hint:
            return mineral_hint.title()
        return resolve_ocr_ore_name(candidate, mineral_hint=mineral_hint)
    if mineral_hint:
        return mineral_hint.title()
    return resolve_ocr_ore_name(name, mineral_hint=mineral_hint)


def trailing_quality(row: str) -> int | None:
    """HUD often shows quality as a bare number after (ORE), e.g. `12.10% TORITE (ORE) 661`."""
    trimmed = row.strip()
    ore_match = ORE_TAG_RE.search(trimmed)
    if ore_match:
        tail = trimmed[ore_match.end() :]
        tail_numbers = re.findall(r"\b(\d{1,4})\b", tail)
        if tail_numbers:
            value = int(tail_numbers[-1])
            if 0 <= value <= 9999:
                return value
    for pattern in (EXPLICIT_Q_RE, ORE_Q_RE):
        match = pattern.search(trimmed)
        if not match:
            continue
        value = int(match.group(1))
        if 1 <= value <= 9999:
            return value
    if ORE_TAG_RE.search(trimmed):
        match = TRAILING_Q_LOOSE_RE.search(trimmed)
        if match:
            value = int(match.group(1))
            if 1 <= value <= 9999:
                return value
    return None


def find_comp_header_index(lines: list[str]) -> int | None:
    for index, line in enumerate(lines):
        if COMP_HEADER_RE.search(line):
            return index
    return None


def find_composition_end_index(lines: list[str], comp_idx: int) -> int:
    """Exclusive end index for valuable rows below COMP (stops before INERT/footer)."""
    window_end = min(len(lines), comp_idx + MAX_COMPOSITION_WINDOW)
    for index in range(comp_idx + 1, window_end):
        if HUD_FOOTER_RE.search(lines[index]):
            return index
    for index in range(comp_idx + 1, window_end):
        if is_inert_anchor_row(lines[index]):
            return index
    return window_end


def extract_total_scu(lines: list[str], comp_idx: int, end_idx: int) -> float | None:
    from panel_mass_scu_parse import extract_total_scu_from_lines

    _ = comp_idx
    _ = end_idx
    return extract_total_scu_from_lines(lines)


def parse_composition_row(row: str, mineral_hint: str | None = None) -> CompositionLine | None:
    strict = COMPOSITION_WITH_Q_RE.match(row.strip())
    if strict:
        percent = parse_leading_percent(row) or float(strict.group(1))
        element_name = normalize_element_name(strict.group(2), mineral_hint)
        quality = int(strict.group(3))
        if element_name == "Inert":
            return None
        return CompositionLine(
            element_name=element_name,
            percent=percent,
            quality=quality,
            quality_missing=False,
            raw_line=row.strip(),
        )

    if not is_composition_percent_row(row):
        return None

    percent = parse_leading_percent(row)
    if percent is None:
        return None

    quality = trailing_quality(row)
    element_raw = COMPOSITION_PERCENT_RE.sub("", row, count=1).strip()
    element_raw = MASS_COUNT_TAIL_RE.sub("", element_raw).strip()
    if quality is not None:
        element_raw = ORE_Q_RE.sub("", element_raw).strip()
        element_raw = TRAILING_Q_LOOSE_RE.sub("", element_raw).strip()
        element_raw = EXPLICIT_Q_RE.sub("", element_raw).strip()
    element_name = normalize_element_name(element_raw, mineral_hint)
    if not element_name or element_name == "Inert" or element_name.isdigit():
        return None

    return CompositionLine(
        element_name=element_name,
        percent=percent,
        quality=quality,
        quality_missing=quality is None,
        raw_line=row.strip(),
    )


def assign_band_ranks(lines: list[CompositionLine]) -> None:
    by_element: dict[str, list[int]] = {}
    for index, line in enumerate(lines):
        by_element.setdefault(line.element_name, []).append(index)
    for indices in by_element.values():
        if len(indices) < 2:
            continue
        sorted_indices = sorted(indices, key=lambda i: lines[i].percent)
        for rank, line_index in enumerate(sorted_indices):
            lines[line_index].scan_band_rank = rank


def dedupe_composition_lines(lines: list[CompositionLine]) -> list[CompositionLine]:
    seen: set[tuple[str, float]] = set()
    deduped: list[CompositionLine] = []
    for line in lines:
        key = (line.element_name.lower(), line.percent)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(line)
    return deduped


def score_parse_result(result: CompositionParseResult, mineral_hint: str | None = None) -> float:
    if not result.ok:
        return -100.0
    score = 0.0
    if result.total_scu is not None:
        score += 15.0
        if abs(result.total_scu - round(result.total_scu)) > 0.01:
            score += 8.0
    valuable_sum = sum(line.percent for line in result.lines)
    if valuable_sum <= 100.5:
        score += 10.0 - abs(valuable_sum - 100.0) * 2.0
    else:
        score -= 25.0
    for line in result.lines:
        score += 6.0
        if mineral_hint and line.element_name.lower() == mineral_hint.lower():
            score += 4.0
        elif len(line.element_name) >= 4:
            score += 2.0
        if not line.quality_missing:
            score += 3.0
    score -= len(result.warnings) * 0.25
    return score


def parse_composition_from_lines(
    lines: list[str],
    *,
    mineral_hint: str | None = None,
    ocr_pass: str | None = None,
) -> CompositionParseResult:
    result = CompositionParseResult(ok=False, ocr_lines=list(lines), ocr_pass=ocr_pass)

    comp_idx = find_comp_header_index(lines)
    if comp_idx is None:
        result.error = "Could not find COMP header in OCR text."
        return result

    end_idx = find_composition_end_index(lines, comp_idx)
    if end_idx <= comp_idx:
        result.error = "No composition rows found below COMP header."
        return result

    result.comp_header_index = comp_idx
    result.inert_anchor_index = None
    result.inert_anchor_line = None
    for index in range(comp_idx + 1, end_idx):
        if is_inert_anchor_row(lines[index]):
            result.inert_anchor_index = index
            result.inert_anchor_line = lines[index]
            break

    result.total_scu = extract_total_scu(lines, comp_idx, end_idx)

    for row in lines[comp_idx + 1 : end_idx]:
        parsed = parse_composition_row(row, mineral_hint)
        if parsed is None:
            continue
        result.lines.append(parsed)

    result.lines = dedupe_composition_lines(result.lines)

    if not result.lines:
        result.error = "No valuable composition rows found below COMP header."
        return result

    if result.total_scu is None:
        result.warnings.append("Could not read COMP total SCU from OCR text.")

    assign_band_ranks(result.lines)

    for line in result.lines:
        if line.quality_missing:
            result.warnings.append(f"Missing Q band on {line.element_name} ({line.percent}%).")

    result.ok = True
    return result


def pick_best_composition_parse(
    candidates: list[tuple[str, list[str]]],
    *,
    mineral_hint: str | None = None,
) -> CompositionParseResult:
    best = CompositionParseResult(ok=False, error="No OCR candidates produced text.")
    best_score = float("-inf")
    for ocr_pass, lines in candidates:
        parsed = parse_composition_from_lines(lines, mineral_hint=mineral_hint, ocr_pass=ocr_pass)
        score = score_parse_result(parsed, mineral_hint)
        if score > best_score:
            best = parsed
            best_score = score
    return best


def extract_total_scu_from_candidates(
    candidates: list[tuple[str, list[str]]],
) -> tuple[float | None, str | None]:
    """Scan every OCR pass for a COMP/SCU total (prefer decimal reads)."""
    from panel_mass_scu_parse import best_total_scu_from_candidates

    return best_total_scu_from_candidates(candidates, mass=None)


def parse_composition_from_candidates(
    candidates: list[tuple[str, list[str]]],
    *,
    mineral_hint: str | None = None,
) -> CompositionParseResult:
    result = pick_best_composition_parse(candidates, mineral_hint=mineral_hint)
    if result.total_scu is None:
        total_scu, scu_pass = extract_total_scu_from_candidates(candidates)
        if total_scu is not None:
            result.total_scu = total_scu
            if scu_pass and scu_pass != result.ocr_pass:
                result.warnings.append(
                    f"COMP SCU read from alternate OCR pass ({scu_pass})."
                )
            if "Could not read COMP total SCU from OCR text." in result.warnings:
                result.warnings.remove("Could not read COMP total SCU from OCR text.")
    return result


def parse_composition_from_panel(
    panel_img: Image.Image,
    *,
    mineral_hint: str | None = None,
    line_candidates: list[tuple[str, list[str]]] | None = None,
    fast: bool = False,
) -> CompositionParseResult:
    if line_candidates is not None:
        return parse_composition_from_candidates(
            line_candidates, mineral_hint=mineral_hint
        )
    from panel_tesseract import ocr_panel_line_candidates_fast

    candidates = (
        ocr_panel_line_candidates_fast(panel_img)
        if fast
        else ocr_panel_line_candidates(panel_img)
    )
    return parse_composition_from_candidates(candidates, mineral_hint=mineral_hint)
