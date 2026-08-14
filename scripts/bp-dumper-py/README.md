# BP Dumper (Python)

Desktop log watcher for Star Citizen — syncs blueprint unlocks and powers Live Mission Tracker.

## Members

Pick **one** path. Do every step in order.

---

### Path A — Windows exe (no Python)

1. Open **Dumper Apps** on the site (avatar menu or Mission Tracker).
2. Under **Downloads**, download **DumperApps.exe**.
3. Run the exe. Let it auto-detect Star Citizen (LIVE), or paste your LIVE folder path when asked.
4. Copy your **API key** from Dumper Apps on the site and paste it when the exe asks.
5. On first run, answer **Y** to full history import so old log files are scanned.
6. Leave the window running while you play.

---

### Path B — Python scripts (macOS / Linux / Windows scripts)

You **must install Python** before these scripts will run. Do **not** copy a bare GitHub source folder — download the release zip in step 3.

#### Step 1 — Install Python

1. Download Python **3.8 or newer** from: https://www.python.org/downloads/
2. Run the installer.
3. On Windows: check **Add python.exe to PATH**, then click Install Now.
4. When install finishes, **close and reopen** Command Prompt / Terminal (PATH only updates in a new window).

#### Step 2 — Confirm Python works

In a **new** terminal, run:

```bat
python --version
python -m pip --version
```

Both commands must print a version number.

Always install packages with **`python -m pip`**. Do not use bare `pip` (Windows often says “pip is not recognized”).

#### Step 3 — Download the scripts zip

1. Open **Dumper Apps** on the site → **Downloads**.
2. Download **Python scripts zip** (`BPDumper-python-scripts.zip`).  
   Same file on GitHub Releases: https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest
3. Extract the zip to a folder on your PC (example: `Desktop\BPDumper-python-scripts`).
4. Confirm that folder contains:
   - `dumper.py`
   - `lookup.json` **or** `blueprint-name-lookup.json`
   - `requirements.txt`
   - `dumper.bat` (Windows) / `dumper.sh` (macOS / Linux)

#### Step 4 — Create a virtual environment

Open a terminal **in the extracted folder**, then run:

```bat
python -m venv .venv
```

#### Step 5 — Activate the virtual environment

**Windows:**

```bat
.venv\Scripts\activate
```

**macOS / Linux:**

```bash
source .venv/bin/activate
```

#### Step 6 — Install dependencies

```bat
python -m pip install -r requirements.txt
```

#### Step 7 — Run the watcher

1. Copy your **API key** from Dumper Apps on the site.
2. Run:

```bat
python dumper.py --watch
```

3. Paste the API key when asked.
4. On first run, answer **Y** to full history import so old log files are scanned.
5. Leave the watcher running while you play.

#### Windows only — `dumper.bat`

After Steps 1–3, you can double-click **`dumper.bat`** in the extracted folder. It runs Steps 4–7 for you. You still paste your API key when asked and answer **Y** to full history import on first run.

---

### Troubleshooting

| Symptom | Fix |
|---|---|
| `python` not recognized | Redo Step 1 with **Add python.exe to PATH**, reopen terminal |
| `pip` not recognized | Use `python -m pip …` (Step 2) |
| Dependency conflict with other Python apps | Stay inside the `.venv` from Steps 4–5 (or use `dumper.bat`) |
| Missing lookup / `FileNotFoundError` | Use the release zip from Step 3. File must be named `lookup.json` **or** `blueprint-name-lookup.json` next to `dumper.py` |
| Star Citizen not detected | Paste your LIVE folder path (folder that contains `Game.log`) |

## Developer setup

Requires **Python 3.8+** on PATH. From a full repo clone:

```bash
npm run copy-blueprint-lookup   # writes scripts/bp-dumper-py/lookup.json
cd scripts/bp-dumper-py
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python dumper.py --watch --key "dr_your_api_key"
```

Pack the member zip locally: `npm run pack-bp-dumper-py-zip` → `scripts/installer/output/BPDumper-python-scripts.zip`.

### CLI examples

```bash
# Dry run — scan local Game.log without sending to the API
python dumper.py --dry-run

# Watch mode with API key
python dumper.py --watch --key "dr_your_api_key"

# One-shot import from a specific log file
python dumper.py /path/to/Game.log --key "dr_your_api_key"

# One-time full history catch-up (ALL .log files, skips min game-version filter)
python dumper.py --full-history-import --key "dr_your_api_key"
```

On first run (no `.env` yet), the wizard defaults **full history import** to **Y**. After it finishes, `FULL_HISTORY_IMPORT` is set to `false` so later launches only watch. Re-run catch-up with `--full-history-import` or `--configure`.

Releases and versioning: [`../bp-dumper/README.md`](../bp-dumper/README.md).
