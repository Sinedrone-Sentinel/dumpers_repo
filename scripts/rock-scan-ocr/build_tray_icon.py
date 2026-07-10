#!/usr/bin/env python3
"""Build assets/tray.ico from the site DR favicon (public/favicon.png)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
FAVICON_CANDIDATES = (
    REPO_ROOT / "public" / "favicon.png",
    REPO_ROOT.parent / "Dumpers Repo" / "public" / "favicon.png",
)
OUT_PATH = SCRIPT_DIR / "assets" / "tray.ico"
ICO_SIZES = (16, 24, 32, 48, 64)


def _find_favicon() -> Path:
    for path in FAVICON_CANDIDATES:
        if path.is_file():
            return path
    raise FileNotFoundError(
        "DR favicon not found. Expected public/favicon.png in the worktree or main repo."
    )


def build_tray_icon() -> Path:
    src = _find_favicon()
    master = Image.open(src).convert("RGBA")
    icons = [master.resize((size, size), Image.Resampling.LANCZOS) for size in ICO_SIZES]
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    icons[0].save(
        OUT_PATH,
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
        append_images=icons[1:],
    )
    return OUT_PATH


def main() -> int:
    out = build_tray_icon()
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
