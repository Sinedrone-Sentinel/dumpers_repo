"""Snap OCR quality numbers to game ledger bands (handles 370→874 style misreads)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from panel_digit_normalize import single_slash_zero_variants

_BANDS_PATH = (
    Path(__file__).resolve().parents[2] / "src" / "data" / "game-quality-bands.json"
)


@lru_cache(maxsize=1)
def _ledger_thresholds() -> dict[str, list[int]]:
    if not _BANDS_PATH.is_file():
        return {}
    data = json.loads(_BANDS_PATH.read_text(encoding="utf-8"))
    thresholds = data.get("bandThresholds") or {}
    return {
        key: [int(value) for value in values]
        for key, values in thresholds.items()
        if isinstance(values, list)
    }


def ore_resource_key(ore_name: str) -> str:
    return ore_name.strip().lower().replace(" ", "")


def ledger_bands_for_ore(ore_name: str) -> list[int]:
    return list(_ledger_thresholds().get(ore_resource_key(ore_name), []))


def nearest_ledger_band(ore_name: str, raw_quality: int) -> int | None:
    bands = ledger_bands_for_ore(ore_name)
    if not bands:
        return None
    if raw_quality in bands:
        return raw_quality
    return min(bands, key=lambda band: abs(band - raw_quality))


def ocr_quality_variants(value: int) -> set[int]:
    """Slash-zero plus common HUD digit swaps when snapping to ledger bands."""
    variants = single_slash_zero_variants(value)
    text = str(value)
    for index, char in enumerate(text):
        for source, target in (("8", "0"), ("9", "0"), ("0", "8"), ("0", "9"), ("8", "3"), ("3", "8"), ("8", "6"), ("6", "8")):
            if char == source:
                variants.add(int(text[:index] + target + text[index + 1 :]))
    return variants


def resolve_quality_reading(
    ore_name: str,
    raw_quality: int,
    *,
    alternate_reads: list[int] | None = None,
) -> int:
    """Exact ledger band, else nearest after slash-zero / 3↔8 OCR variants."""
    bands = ledger_bands_for_ore(ore_name)
    if not bands:
        return raw_quality

    candidates: set[int] = {raw_quality}
    for reading in alternate_reads or []:
        candidates.add(reading)
    for reading in list(candidates):
        candidates.update(ocr_quality_variants(reading))

    for candidate in sorted(candidates):
        if candidate in bands:
            return candidate

    return min(bands, key=lambda band: min(abs(band - candidate) for candidate in candidates))
