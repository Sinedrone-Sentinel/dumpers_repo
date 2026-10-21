"""Print one XML member from a socpak (zip). CryEngine zips mix slash styles."""
import sys
import zipfile
from pathlib import Path

socpak = Path(sys.argv[1])
want = sys.argv[2].replace("\\", "/").lower()
with zipfile.ZipFile(socpak) as archive:
    for info in archive.infolist():
        name = info.filename.replace("\\", "/")
        if name.lower() != want and not name.lower().endswith("/" + want):
            continue
        info.orig_filename = info.orig_filename.replace("/", "\\")
        sys.stdout.buffer.write(archive.read(info))
        raise SystemExit(0)
raise SystemExit(1)
