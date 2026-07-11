# Rock Scanner OCR

Powers the **OCR** button on the Rock Calculator. Members do not need this README — use **Dumper Apps** on the site.

## Member setup (Windows)

1. Download **`bp-dumper-py.zip`** (Windows recommended) from Dumper Apps releases.
2. Unzip → double-click **`START-HERE.bat`** → paste your API key.
3. **Once per resolution:** right-click the DR tray icon → **Calibrate RESULTS panel**.
4. In-game: Mole pilot, RESULTS panel open → site → Rock Calculator → **OCR**.

`START-HERE.bat` installs Python packages automatically and can install Python / Tesseract via winget if they are missing. SC_OCR models are **bundled inside the release zip** — no SC Toolbox clone.

## Developers (git clone)

Optional override: copy `sc-toolbox.path.example` → `sc-toolbox.path` if you use a local SC-Toolbox checkout instead of `vendor/Mining_Signals` from CI.

```powershell
pip install -r requirements.txt
python rock_scan_test.py
```

Bridge: `http://127.0.0.1:38471`
