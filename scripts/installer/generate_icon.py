"""Generate BP Dumper .ico files from scripts/installer/bp-dumper-icon.png.

Centers the custom-shaped mark on a transparent square so 16–256px Windows
icons stay readable (exe + tray / shortcuts).
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PNG = Path(__file__).resolve().parent / "bp-dumper-icon.png"
INSTALLER = Path(__file__).resolve().parent
OUTPUTS = (
    INSTALLER / "dumper-apps.ico",  # PyInstaller exe icon
    INSTALLER / "tray.ico",  # Inno Setup / shortcuts
)

# Master canvas + Windows ICO sizes (Pillow skips sizes larger than the source
# image, so we always build from a 256px master).
MASTER = 256
PADDING = 0.06  # icon art already has transparent margin
SIZES = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]


def build_master(src: Image.Image) -> Image.Image:
    rgba = src.convert("RGBA")
    bbox = rgba.getbbox()
    if not bbox:
        raise SystemExit(f"No opaque pixels in {PNG}")
    glyph = rgba.crop(bbox)

    canvas = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    inner = int(round(MASTER * (1.0 - 2.0 * PADDING)))
    gw, gh = glyph.size
    scale = min(inner / gw, inner / gh)
    tw, th = max(1, int(round(gw * scale))), max(1, int(round(gh * scale)))
    fitted = glyph.resize((tw, th), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((MASTER - tw) // 2, (MASTER - th) // 2), fitted)
    return canvas


def write_ico(master: Image.Image, dest: Path) -> None:
    frames = [master.resize(size, Image.Resampling.LANCZOS) for size in SIZES]
    frames[0].save(
        dest,
        format="ICO",
        sizes=[frame.size for frame in frames],
        append_images=frames[1:],
    )
    print(f"Wrote {dest} ({len(frames)} sizes, master {master.size[0]}px)")


def main() -> None:
    if not PNG.is_file():
        raise SystemExit(f"Missing BP Dumper icon source: {PNG}")
    master = build_master(Image.open(PNG))
    for ico in OUTPUTS:
        write_ico(master, ico)


if __name__ == "__main__":
    main()
