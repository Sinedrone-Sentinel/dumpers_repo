#!/usr/bin/env python3
"""
Legacy calibrate-only entry (prefer tray menu or `python rock_scan_test.py`).

Draws the RESULTS panel box on a frozen snapshot and saves capture-region.json.
"""

from __future__ import annotations

import sys

from calibrate_flow import run_calibration_overlay
from region_store import REGION_FILE


def main() -> int:
    print(f"Region will be saved locally to: {REGION_FILE}")
    return 0 if run_calibration_overlay(enter_label="Enter = save") else 1


if __name__ == "__main__":
    raise SystemExit(main())
