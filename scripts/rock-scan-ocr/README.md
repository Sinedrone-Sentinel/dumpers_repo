# Rock Scan OCR — local test harness

**Local-only.** This folder lives on branch `local/rock-scan-ocr-test` in the Rock Scan Test worktree. Do not merge to live `main` until SC_OCR accuracy is confirmed.

## What it does

One command:

1. Briefly grabs a **frozen snapshot** of the game for the region overlay
2. Shows your saved **RESULTS panel box** (adjust if needed)
3. **Enter** → saves the box, **live capture + SC_OCR + composition OCR**, exports PNG + JSON

Phase 1 (SC_OCR): **mass**, **resistance**

Phase 2 (Tesseract): **COMP SCU**, composition **%**, **Q bands**, element names

**Pass-through:** instability, mineral name

**Never OCR:** inert (INERT/MATERIALS row is only a bottom anchor)

## Setup (one time)

### 1. Clone SC Toolbox (outside this repo)

```powershell
cd "C:\Users\AT4_Backblast\Desktop\Coding Projects"
git clone https://github.com/ScPlaceholder/SC-Toolbox-Beta-V2.git
```

### 2. Point BP Dumper at Mining_Signals

```powershell
cd "Dumpers Repo - Rock Scan Test\scripts\rock-scan-ocr"
copy sc-toolbox.path.example sc-toolbox.path
# Edit sc-toolbox.path → full path to tools\Mining_Signals
```

Or set env: `$env:SC_TOOLBOX_MINING_SIGNALS = "C:\...\SC-Toolbox-Beta-V2\tools\Mining_Signals"`

### 3. Install Python deps

```powershell
pip install -r requirements.txt
pip install -r "C:\...\SC-Toolbox-Beta-V2\tools\Mining_Signals\requirements.txt"
```

Install [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) for composition parsing.

## Architecture

| Process | Role |
|---------|------|
| **BP Dumper watch** | Tails `Game.log` — missions + blueprint rewards (always on) |
| **Rock scan tray** (Windows) | System tray icon — **Calibrate RESULTS panel** + localhost bridge |
| **Rock scan bridge** | `http://127.0.0.1:38471` — Calculator **OCR** button triggers `POST /scan` |
| **Rock scan OCR** | Desktop capture + SC_OCR + composition (runs on demand, does not block watcher) |

BP Dumper starts the tray (Windows) or bridge (other OS) automatically in watch mode. Log watching and OCR are independent.

### First-time calibration (tray)

1. Start BP Dumper in watch mode — a **Dumper Rock Scan** tray icon appears (Windows).
2. Right-click → **Calibrate RESULTS panel**.
3. Draw a box around the Mole pilot **RESULTS** panel on the frozen snapshot, press **Enter**.
4. Re-calibrate from the tray if you change resolution or HUD scale.

CLI alternative: `python rock_scan_test.py` (overlay + immediate test scan).

## Run

In-game: Mole pilot, rock scanned, **RESULTS** panel visible (far-right text panel with MASS / RES / INST / COMP — **not** the circular reticle).

```powershell
cd "C:\Users\AT4_Backblast\Desktop\Coding Projects\Dumpers Repo - Rock Scan Test\scripts\rock-scan-ocr"
python rock_scan_test.py
```

1. Snapshot overlay appears (saved box pre-drawn if you've run before)
2. Drag to adjust, or press **Enter** if the box looks good
3. Live capture + OCR runs immediately — focus returns to PowerShell with results

**Esc** cancels. **R** resets the box.

### Offline replay (no game)

```powershell
python rock_scan_test.py --from-image rock-scan-exports\20260710_163522\panel-crop.png
```

### Repeat scans (skip overlay)

```powershell
python rock_scan_test.py --skip-calibrate
```

### Watch mode (overlay once, then repeat)

```powershell
python rock_scan_test.py --watch 5
```

`rock_scan_calibrate.py` still exists for calibrate-only, but you shouldn't need it.

## Export layout

```
rock-scan-exports/
  20260710_153045/
    panel-crop.png
    game-client.png
    result.json
    ocr-lines.txt
```

## What to verify

| Priority | Fields | Why |
|----------|--------|-----|
| **Must match HUD** | mass, resistance | Calculator total SCU + CHP |
| **Phase 2** | composition %, Q, COMP SCU | Ledger DFP rows (via calculator) |
| **Pass-through** | instability | Not used in calculator math |
| **Never OCR** | inert | Calculator derives |
