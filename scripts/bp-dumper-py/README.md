# BP Dumper (Python)

Desktop log watcher for Star Citizen — syncs blueprint unlocks and powers Live Mission Tracker on Windows.

## Members (Windows)

1. Open **Dumper Apps** on the site (avatar menu or Mission Tracker).
2. Download **Windows installer** and run the setup wizard.
3. Open **Dumper Apps** from the Start Menu and paste your API key when prompted.

The installer bundles Python and the scripts in this folder — no separate Python install required.

## Developer setup

Requires **Python 3.8+** on PATH.

```bash
cd scripts/bp-dumper-py
pip install -r requirements.txt
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
```

Releases and versioning: [`../bp-dumper/README.md`](../bp-dumper/README.md).
