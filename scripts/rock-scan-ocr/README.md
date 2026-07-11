# Rock Scanner OCR

Desktop capture + OCR for the **Rock Calculator** on [dumpers-repo.com](https://dumpers-repo.com). Runs alongside BP Dumper on the same PC.

## Member quick start (Windows)

1. Download **`bp-dumper-py.zip`** from [Dumper Apps releases](https://github.com/michael-linzenmeyer/dumpers-repo/releases) (tagged `v*`).
2. Unzip anywhere (e.g. `Desktop\Dumper Apps`) — keep the `scripts\` folder next to **`START-HERE.bat`**.
3. **One-time setup:**
   - Install [Python 3.8+](https://www.python.org/downloads/) — check **Add Python to PATH**.
   - Install [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki).
   - Clone [SC-Toolbox-Beta-V2](https://github.com/ScPlaceholder/SC-Toolbox-Beta-V2) outside the zip folder.
   - Copy `scripts\rock-scan-ocr\sc-toolbox.path.example` → `scripts\rock-scan-ocr\sc-toolbox.path` and point it at `...\SC-Toolbox-Beta-V2\tools\Mining_Signals`.
   - `pip install -r` that SC Toolbox `Mining_Signals/requirements.txt` (START-HERE installs repo deps).
4. Double-click **`START-HERE.bat`** — one window runs BP Dumper watch mode + the **DR** system tray icon (port **38471**).
5. Paste your API key when prompted (from **Dumper Apps** on the site).
6. **First time per resolution:** right-click DR tray → **Calibrate RESULTS panel** (draw a box around the Mole pilot RESULTS panel).
7. In-game: Mole pilot, rock scanned, RESULTS panel open → site **Mining Tracker → Rock Calculator → OCR**.

**Reload tray after updates:** double-click `RESTART-TRAY.vbs` (stops the old bridge, starts fresh — no need to close BP Dumper).

> **Go `.exe` builds** sync blueprints only. Rock Scanner OCR requires the **Python zip** on Windows.

## What it reads

| Priority | Fields |
|----------|--------|
| **Calculator-critical** | mass, RES, COMP SCU, composition %, Q bands |
| **Pass-through** | instability, mineral names |
| **Never OCR** | inert (calculator derives) |

Pipeline: frozen game snapshot → SC_OCR (mass, RES) + Tesseract on RESULTS crop (composition).

## Architecture

| Process | Role |
|---------|------|
| **BP Dumper watch** | Tails `Game.log` — missions + blueprint rewards |
| **Rock scan tray** | System tray — calibrate + localhost bridge |
| **Bridge** | `http://127.0.0.1:38471` — Calculator **OCR** button calls `POST /scan` |
| **OCR worker** | On-demand capture; does not block log watching |

## Developer / CLI

From `scripts/rock-scan-ocr` in the repo (or `scripts\rock-scan-ocr` inside the release zip):

```powershell
python rock_scan_test.py              # overlay + test scan
python rock_scan_test.py --skip-calibrate
python rock_scan_test.py --from-image rock-scan-exports\...\panel-crop.png
```

Calibration-only: `python rock_scan_calibrate.py`

Local exports (gitignored): `rock-scan-exports/<timestamp>/` with `panel-crop.png`, `result.json`, etc.
