# Local rock-scan OCR test worktree

This folder is a **git worktree** for SC_OCR integration testing. It is **not** pushed to live GitHub.

| Item | Value |
|------|-------|
| Branch | `local/rock-scan-ocr-test` |
| Main repo | `Dumpers Repo` (unchanged on `main`) |

## Start desktop apps (one click)

**Double-click:**

```
START-HERE.bat
```

Opens **one** window: **BP Dumper + Rock Scan Tray** (DR icon by the clock).

**Website:** use the **live site** — **https://dumpers-repo.com** — not `npm run dev`. Sign in → Mining → Rock Calculator → **OCR**.

**First time only:** right-click DR tray → **Calibrate RESULTS panel**.

**Tray only** (no log watch): `RESTART-TRAY.vbs`

## One-time setup

1. Clone [SC-Toolbox-Beta-V2](https://github.com/ScPlaceholder/SC-Toolbox-Beta-V2) on disk.
2. Copy `scripts/rock-scan-ocr/sc-toolbox.path.example` → `sc-toolbox.path` → point at `...\tools\Mining_Signals`.
3. Install [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki).
4. `pip install -r` SC Toolbox `tools/Mining_Signals/requirements.txt` (START-HERE installs repo Python deps).

## Ports (fixed — do not confuse these)

| What | Port |
|------|------|
| Rock scan bridge (tray) | **38471** — `http://127.0.0.1:38471` |
| `npm run dev` (devs only) | 5173 — **not used** for normal OCR testing |

## Do not push

Keep commits on this branch local until OCR accuracy is confirmed.
