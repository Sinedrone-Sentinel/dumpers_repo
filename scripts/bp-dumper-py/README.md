# BP Dumper (Python)

Desktop log watcher for Star Citizen — syncs blueprint unlocks and powers Live Mission Tracker.

## Members

### Windows (recommended)

1. Open **Dumper Apps** on the site (avatar menu or Mission Tracker).
2. Download **Windows exe (DumperApps.exe)** and run it.
3. Paste your API key when asked on first run.

No separate Python install. The exe embeds everything it needs (including the blueprint name lookup).

### macOS / Linux / advanced Windows (Python scripts)

**Do not** copy only the GitHub source folder — `lookup.json` is not published there. Use the release zip.

#### 1. Install Python 3.8+

- Download from https://www.python.org/downloads/
- On Windows: check **Add python.exe to PATH**, then close and reopen Command Prompt
- Verify:

```bat
python --version
python -m pip --version
```

If `pip` alone says “not recognized”, always use **`python -m pip`** (that is normal and preferred).

If `python` is missing, repair/reinstall Python with PATH enabled, or try `py -m pip …` (Windows launcher).

#### 2. Download the scripts zip

From **Dumper Apps → Downloads**, get **Python scripts zip** (`BPDumper-python-scripts.zip`), or the same file from [GitHub Releases](https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest).

Extract it. The folder must include at least:

- `dumper.py`
- `lookup.json` ← required (maps Game.log names)
- `requirements.txt`
- `dumper.bat` / `dumper.sh`

#### 3. Install deps in a virtual environment

A venv keeps these packages from fighting other Python apps on the PC:

```bash
cd path/to/extracted/BPDumper-python-scripts
python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS / Linux:
# source .venv/bin/activate

python -m pip install -r requirements.txt
python dumper.py --watch
```

**Windows shortcut:** double-click **`dumper.bat`** — it creates `.venv`, installs deps there, then starts the watcher.

#### 4. API key + first run

Copy your API key from Dumper Apps on the site. Paste when prompted. Optional one-time **full history import** scans old logs (can take a while).

Leave the watcher running while you play.

#### Troubleshooting

| Symptom | Fix |
|---|---|
| `pip` not recognized | Use `python -m pip …` or fix Python PATH (step 1) |
| Dependency conflict / aider / other tools | Use `.venv` or `dumper.bat` — do not install into global Python |
| `FileNotFoundError` / missing lookup | Put **`lookup.json` or `blueprint-name-lookup.json`** next to `dumper.py` (no rename needed). Prefer the release zip. Newer scripts auto-download once if online |
| Star Citizen not detected | Paste your LIVE folder path when asked (folder that contains `Game.log`) |

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

# One-time full history catch-up (ALL log files, no version filter)
python dumper.py --full-history-import --key "dr_your_api_key"
```

On first run and `--configure`, the wizard defaults **full history import** to **Y** (Enter). That scan has no version filter. After it finishes, `FULL_HISTORY_IMPORT` is set to `false` so later launches only watch. Re-run catch-up with `--full-history-import` or `--configure`. Recent backup import is current patch only (for example `4.10.x`).

Releases and versioning: [`../bp-dumper/README.md`](../bp-dumper/README.md).
