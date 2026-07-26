"""Generate BP Dumper .ico files from public/favicon.png (transparent DR mark)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PNG = ROOT / "public" / "favicon.png"
INSTALLER = Path(__file__).resolve().parent
OUTPUTS = (
    INSTALLER / "dumper-apps.ico",  # PyInstaller exe icon
    INSTALLER / "tray.ico",  # Inno Setup / shortcuts
)

from PIL import Image

img = Image.open(PNG).convert("RGBA")
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
for ico in OUTPUTS:
    img.save(ico, format="ICO", sizes=sizes)
    print(f"Wrote {ico}")
