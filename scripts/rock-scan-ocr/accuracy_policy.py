"""Which OCR fields matter for the Rock Calculator / Ledger / CHP pipeline."""

from __future__ import annotations

ACCURACY_TARGETS = {
    "phase_1_sc_ocr": [
        "mass",
        "resistance",
    ],
    "phase_2_composition": [
        "total_scu",
        "composition_percent",
        "quality_bands",
        "element_names",
    ],
}

PASS_THROUGH_FIELDS = [
    "instability",
    "mineral_name",
]

NEVER_OCR_FIELDS = [
    "inert_percent",
]

ACCURACY_NOTES = [
    "Instability is pass-through only (CHP/display); do not block on INST accuracy.",
    "Inert is never OCR'd — the calculator derives it from valuable composition %.",
    "Composition parsing stops before INERT/MATERIALS or HUD footer when present; inert is not read.",
    "Ledger DFP rows come from calculator outputs (SCU × % × quality), not raw OCR.",
]
