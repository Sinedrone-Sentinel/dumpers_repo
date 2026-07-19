"""Generate scripts/installer/dumper-apps.ico from public/favicon.png."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PNG = ROOT / "public" / "favicon.png"
ICO = Path(__file__).resolve().parent / "dumper-apps.ico"

from PIL import Image

img = Image.open(PNG).convert("RGBA")
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
img.save(ICO, format="ICO", sizes=sizes)
print(f"Wrote {ICO}")
