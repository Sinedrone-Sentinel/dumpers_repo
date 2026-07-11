"""Shared types for live rock-scan OCR."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LiveScanResult:
    ok: bool
    sc_ocr: dict | None = None
    composition: dict | None = None
    error: str | None = None
    hints: list[str] | None = None
