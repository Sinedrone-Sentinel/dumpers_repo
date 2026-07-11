# Dumper Apps Windows installer

Builds **`DumperApps-Setup-X.Y.Z.exe`** — a self-contained install with bundled Python, Tesseract, SC_OCR models, BP Dumper, and Rock Scanner.

Members: download from **Dumper Apps** on the site → run the installer → paste API key → calibrate tray once → use OCR.

## Local build (maintainers)

Requires **Windows**, **Inno Setup 6**, **git**, and network.

```powershell
cd "Dumpers Repo"
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/prepare-bundle.ps1
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" /DAppVersion=1.5.0 scripts/installer/dumper-apps.iss
```

Output: `scripts/installer/output/DumperApps-Setup-1.5.0.exe`

## CI

`.github/workflows/build-releases.yml` job **`build-windows-installer`** runs on `windows-latest` and uploads the installer to the GitHub release alongside Go binaries and the portable zip.
