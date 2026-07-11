"""Slash-zero HUD font fixes — game zeros have a diagonal stroke OCR reads as 8 or 9."""

from __future__ import annotations

import re
from collections import Counter

# Tesseract on orange Mole RESULTS text often confuses slashed 0 with 8 or 9.
SLASH_ZERO_REPLACEMENTS = {"8": "0", "9": "0"}


def vote_digit_char(chars: list[str]) -> str:
    """Prefer 0 when passes disagree only by slashed-zero confusion (0 vs 8/9)."""
    if not chars:
        return "0"
    counts = Counter(chars)
    if "0" in counts and ("8" in counts or "9" in counts):
        return "0"
    return counts.most_common(1)[0][0]


def vote_digit_string(readings: list[str]) -> str | None:
    """Per-digit consensus across OCR passes (e.g. 20177 beats 29177)."""
    cleaned = [reading.strip() for reading in readings if reading and reading.isdigit()]
    if not cleaned:
        return None
    if len({len(item) for item in cleaned}) != 1:
        return Counter(cleaned).most_common(1)[0][0]

    length = len(cleaned[0])
    voted = "".join(vote_digit_char([item[index] for item in cleaned]) for index in range(length))
    return voted


def vote_decimal_string(readings: list[str]) -> str | None:
    """Vote a fixed-point token (60.52 beats 68.52 when a pass reads the true 0)."""
    normalized: list[str] = []
    for reading in readings:
        token = reading.strip().replace(",", "")
        if not token:
            continue
        if "." in token:
            whole, frac = token.split(".", 1)
            frac = (frac + "00")[:2]
            normalized.append(f"{whole}.{frac}")
        elif len(token) == 4:
            normalized.append(f"{token[:2]}.{token[2:]}")
        elif len(token) == 3:
            normalized.append(f"{token[0]}.{token[1:]}")
        else:
            normalized.append(f"{token}.00")

    if not normalized:
        return None

    whole_parts = [item.split(".", 1)[0] for item in normalized]
    frac_parts = [item.split(".", 1)[1] for item in normalized]
    voted_whole = vote_digit_string(whole_parts)
    voted_frac = vote_digit_string(frac_parts) if len({len(f) for f in frac_parts}) == 1 else frac_parts[0]
    if voted_whole is None:
        return None
    if voted_frac is None:
        voted_frac = frac_parts[0]
    return f"{voted_whole}.{voted_frac}"


def single_slash_zero_variants(value: int) -> set[int]:
    """Single-digit 8/9→0 (and 0→8) for one OCR pass with no consensus."""
    text = str(value)
    variants: set[int] = {value}
    for index, char in enumerate(text):
        if char == "8":
            variants.add(int(text[:index] + "0" + text[index + 1 :]))
        elif char == "9":
            variants.add(int(text[:index] + "0" + text[index + 1 :]))
        elif char == "0":
            variants.add(int(text[:index] + "8" + text[index + 1 :]))
            variants.add(int(text[:index] + "9" + text[index + 1 :]))
    return variants


def extract_mass_tokens_from_line(line: str) -> list[str]:
    tokens: list[str] = []
    for match in re.finditer(r"\b(\d{4,6})\b", line):
        tokens.append(match.group(1))
    for match in re.finditer(r"\b(\d{1,3})\s+(\d{3,5})\b", line):
        combined = f"{match.group(1)}{match.group(2)}"
        if 4 <= len(combined) <= 6:
            tokens.append(combined)
    return tokens


def vote_mass_tokens(token_lists: list[list[str]]) -> int | None:
    flat = [token for tokens in token_lists for token in tokens]
    voted = vote_digit_string(flat)
    if voted is None:
        return None
    try:
        return int(voted)
    except ValueError:
        return None
