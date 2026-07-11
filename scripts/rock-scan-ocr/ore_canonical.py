"""OCR ore name cleanup (mirrors site miningOreCanonical heuristics)."""

from __future__ import annotations

_COMMON_ORES = (
    "Quantainium",
    "Savrilium",
    "Stileron",
    "Lindinium",
    "Ouratite",
    "Riccite",
    "Beryl",
    "Bexalite",
    "Laranite",
    "Agricium",
    "Borase",
    "Hephaestanite",
    "Gold",
    "Aslarite",
    "Corundum",
    "Quartz",
    "Titanium",
    "Tungsten",
    "Diamond",
    "Taranite",
    "Aluminum",
    "Copper",
    "Iron",
    "Silicon",
    "Tin",
    "Aphorite",
    "Dolivine",
    "Hadanite",
    "Janalite",
    "Glacosite",
    "Feynmaline",
    "Sadaryx",
    "Beradom",
    "Carinite",
    "Ice",
    "Torite",
)


def _levenshtein(a: str, b: str) -> int:
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


def _ocr_normalize(label: str) -> str:
    return (
        label.lower()
        .replace("5", "s")
        .replace("0", "o")
        .replace("1", "i")
        .replace("8", "b")
        .replace("z", "x")
    )


def resolve_ocr_ore_name(raw: str, *, mineral_hint: str | None = None) -> str:
    label = (raw or "").strip()
    if not label:
        return label

    attempts = [label]
    normalized = _ocr_normalize(label)
    if normalized != label.lower():
        attempts.append(normalized)

    candidates = list(_COMMON_ORES)
    if mineral_hint:
        candidates.insert(0, mineral_hint.title())

    if mineral_hint:
        hint_lower = mineral_hint.lower()
        if _levenshtein(label.lower(), hint_lower) <= 3:
            return mineral_hint.title()

    for attempt in attempts:
        lower = attempt.lower()
        for canonical in candidates:
            if canonical.lower() == lower:
                return canonical

        if len(lower) >= 3:
            prefix_matches = [
                c for c in candidates if c.lower().startswith(lower)
            ]
            if len(prefix_matches) == 1:
                return prefix_matches[0]

        best: str | None = None
        best_dist = 10_000
        for canonical in candidates:
            dist = _levenshtein(lower, canonical.lower())
            if dist < best_dist:
                best_dist = dist
                best = canonical
            elif dist == best_dist:
                best = None
        min_len = 3 if len(label) <= 5 else 4
        if best and 0 < best_dist <= 2 and len(label) >= min_len:
            return best

    return label.title() if label.isupper() else label
