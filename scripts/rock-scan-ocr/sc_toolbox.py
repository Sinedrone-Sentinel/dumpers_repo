"""Resolve SC Toolbox Mining_Signals path for SC_OCR."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def resolve_mining_signals_path(cli_path: str | None = None) -> Path:
    candidates: list[Path] = []

    if cli_path:
        candidates.append(Path(cli_path).expanduser())

    env = os.environ.get("SC_TOOLBOX_MINING_SIGNALS", "").strip()
    if env:
        candidates.append(Path(env).expanduser())

    here = Path(__file__).resolve().parent
    candidates.append(here / "vendor" / "Mining_Signals")

    path_file = here / "sc-toolbox.path"
    if path_file.is_file():
        for line in path_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                candidates.append(Path(line).expanduser())
                break

    candidates.extend(
        [
            here.parent.parent / "SC-Toolbox-Beta-V2" / "tools" / "Mining_Signals",
            here.parent.parent.parent / "SC-Toolbox-Beta-V2" / "tools" / "Mining_Signals",
        ]
    )

    for candidate in candidates:
        resolved = candidate.resolve()
        api = resolved / "ocr" / "sc_ocr" / "api.py"
        if api.is_file():
            return resolved

    tried = "\n".join(f"  - {p}" for p in candidates)
    raise FileNotFoundError(
        "SC Toolbox Mining_Signals path not found.\n"
        "Re-download bp-dumper-py.zip from Dumper Apps releases (SC_OCR is bundled),\n"
        "or clone SC-Toolbox-Beta-V2 and set sc-toolbox.path or SC_TOOLBOX_MINING_SIGNALS.\n"
        f"Tried:\n{tried}"
    )


def ensure_onnx_models(mining_signals: Path) -> list[str]:
    """GitHub clone ships a stub model_hud_cnn.onnx without its .data sidecar.

    SC_OCR prefers that stub and fails to load. Quarantine it so the shipped
    model_cnn.onnx (which has model_cnn.onnx.data) is used instead.
    """
    notes: list[str] = []
    models = mining_signals / "ocr" / "models"
    hud_onnx = models / "model_hud_cnn.onnx"
    hud_data = models / "model_hud_cnn.onnx.data"
    quarantine = models / "model_hud_cnn.onnx.missing_data"

    if hud_onnx.is_file() and not hud_data.is_file():
        if not quarantine.is_file():
            hud_onnx.rename(quarantine)
            notes.append(
                "Quarantined broken model_hud_cnn.onnx (missing .data) — using model_cnn.onnx."
            )
        else:
            notes.append(
                "model_hud_cnn.onnx already quarantined — using model_cnn.onnx."
            )
    return notes


def ensure_sc_ocr_import(mining_signals: Path) -> list[str]:
    notes = ensure_onnx_models(mining_signals)
    root = str(mining_signals.resolve())
    if root not in sys.path:
        sys.path.insert(0, root)
    return notes
