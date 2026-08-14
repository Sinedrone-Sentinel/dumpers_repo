# BP Dumper (Python)

Desktop log watcher for Star Citizen — syncs blueprint unlocks and powers Live Mission Tracker on Windows.

## Members

### Windows (portable exe)

1. Open **Dumper Apps** on the site (avatar menu or Mission Tracker).
2. Download **Windows portable exe** and run it.
3. Paste your API key when the console window asks on first run.

The portable bundle includes Python and the scripts in this folder — no separate Python install required.

### macOS / Linux / Windows scripts

Use a **local virtual environment** so `pip` does not conflict with other Python tools on the machine:

```bash
cd scripts/bp-dumper-py   # or your extracted "bp dumper" folder
python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS / Linux:
# source .venv/bin/activate

python -m pip install -r requirements.txt
python dumper.py --watch
```

Or on Windows double-click **`dumper.bat`** — it creates `.venv`, installs deps there, then runs the watcher.

## Developer setup

Requires **Python 3.8+** on PATH.

```bash
cd scripts/bp-dumper-py
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python dumper.py --watch --key "dr_your_api_key"
```

Or double-click **`dumper.bat`** on Windows and follow the prompts.

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
