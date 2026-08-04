"""Generate Store/MSIX PNG logos from scripts/installer/bp-dumper-icon.png."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
PNG = ROOT / "scripts" / "installer" / "bp-dumper-icon.png"
ASSETS = Path(__file__).resolve().parent / "Assets"

# (filename, size)
OUTPUTS = (
    ("StoreLogo.png", 50),
    ("Square44x44Logo.png", 44),
    ("Square71x71Logo.png", 71),
    ("Square150x150Logo.png", 150),
)


def build_master(src: Image.Image, size: int) -> Image.Image:
    rgba = src.convert("RGBA")
    bbox = rgba.getbbox()
    if not bbox:
        raise SystemExit(f"No opaque pixels in {PNG}")
    glyph = rgba.crop(bbox)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = max(1, int(round(size * 0.06)))
    inner = max(1, size - 2 * pad)
    gw, gh = glyph.size
    scale = min(inner / gw, inner / gh)
    tw, th = max(1, int(round(gw * scale))), max(1, int(round(gh * scale)))
    fitted = glyph.resize((tw, th), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((size - tw) // 2, (size - th) // 2), fitted)
    return canvas


def main() -> None:
    if not PNG.is_file():
        raise SystemExit(f"Missing BP Dumper icon source: {PNG}")
    ASSETS.mkdir(parents=True, exist_ok=True)
    src = Image.open(PNG)
    for name, size in OUTPUTS:
        out = ASSETS / name
        build_master(src, size).save(out, format="PNG")
        print(f"Wrote {out}")


if __name__ == "__main__":
    main()
