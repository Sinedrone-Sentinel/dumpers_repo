"""Map desktop OCR output to Rock Calculator `RockScanOcrResult` JSON."""

from __future__ import annotations


from ore_canonical import is_known_rs_ore, resolve_ocr_ore_name
from panel_ore_parse import resolve_primary_ore_name


def _canonical_ore_label(raw: str) -> str:
    """HUD/SC_OCR often returns ALL CAPS (e.g. IRON); RS Tracker uses title case (Iron)."""
    token = (raw or "").strip()
    if not token:
        return token
    if token.isupper() and token.replace(" ", "").isalpha():
        return token.title()
    return token


def to_rock_scan_ocr_result(sc_ocr: dict, composition: dict) -> dict:
    warnings = list(composition.get("warnings") or [])
    if not sc_ocr.get("panel_visible"):
        warnings.append("SC_OCR did not detect a mining RESULTS panel.")
    if sc_ocr.get("mass") is None:
        warnings.append("Mass was not read from the HUD.")
    if not composition.get("ok"):
        error = composition.get("error") or "Composition OCR failed."
        return {
            "ok": False,
            "error": error,
            "warnings": warnings,
        }

    mineral = sc_ocr.get("mineral_name") or ""
    mass = sc_ocr.get("mass")
    resistance = sc_ocr.get("resistance")
    instability = sc_ocr.get("instability")
    total_scu = composition.get("total_scu")

    if mass is None or resistance is None or total_scu is None:
        missing = []
        if mass is None:
            missing.append("mass")
        if resistance is None:
            missing.append("resistance")
        if total_scu is None:
            missing.append("COMP SCU")
        return {
            "ok": False,
            "error": f"Missing calculator-critical fields: {', '.join(missing)}",
            "warnings": warnings,
        }

    composition_lines = []
    for line in composition.get("lines") or []:
        composition_lines.append(
            {
                "elementName": resolve_ocr_ore_name(
                    line["element_name"], mineral_hint=mineral or None
                ),
                "percent": line["percent"],
                "quality": line["quality"],
                "qualityMissing": line["quality_missing"],
                "scanBandRank": line["scan_band_rank"],
                "rawOcrLine": line["raw_line"],
            }
        )

    if not composition_lines:
        return {
            "ok": False,
            "error": "No valuable composition rows were read.",
            "warnings": warnings,
        }

    panel_lines = list(composition.get("ocr_lines") or [])
    resolved_mineral = resolve_primary_ore_name(panel_lines, composition_lines)
    if resolved_mineral:
        mineral = resolved_mineral
    elif mineral and is_known_rs_ore(resolve_ocr_ore_name(mineral)):
        mineral = resolve_ocr_ore_name(mineral)
    else:
        return {
            "ok": False,
            "error": "Could not read the primary ore — include the ore name (e.g. IRON (ORE)) above MASS.",
            "warnings": warnings,
        }

    mineral = _canonical_ore_label(mineral)

    return {
        "ok": True,
        "data": {
            "primaryOreName": mineral,
            "mass": float(mass),
            "resistancePercent": float(resistance),
            "instability": round(float(instability or 0), 2),
            "totalScu": float(total_scu),
            "compositionLines": composition_lines,
            "warnings": warnings,
        },
    }
