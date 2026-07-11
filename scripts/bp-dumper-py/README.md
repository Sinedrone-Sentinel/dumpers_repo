# BP Dumper

A cross-platform utility to batch-import historical blueprint JSON exports or trail active logs from your game client to your account.

On **Windows**, the **Python zip** from GitHub releases also includes **Rock Scanner OCR** (`START-HERE.bat`, tray on port 38471). Go `.exe` builds sync blueprints only — use the Python zip for Rock Calculator OCR.

---

## 🚀 Quick Start (releases)

Download **`bp-dumper-py.zip`** or a platform `.exe` from [GitHub releases](https://github.com/michael-linzenmeyer/dumpers-repo/releases).

**Python zip (recommended for Rock Scanner on Windows):**

1. Unzip anywhere.
2. Double-click **`START-HERE.bat`** at the zip root.
3. Follow prompts for API key (from **Dumper Apps** on the site).
4. See [`../rock-scan-ocr/README.md`](../rock-scan-ocr/README.md) for Tesseract, SC Toolbox, and tray calibration.

**Single-folder Python (from git clone):**

```bash
cd scripts/bp-dumper-py
pip install -r requirements.txt
pip install -r ../rock-scan-ocr/requirements.txt
python dumper.py --watch
```

---

## 🛠️ Python/Developer Setup Instructions

### 1. Prerequisites
- **Python 3.8+** must be installed on your system.
  - Windows: Make sure **"Add Python to PATH"** is selected during installation.
  - macOS/Linux: Usually installed by default. Verify via `python3 --version`.

### 2. Installation
Open your terminal (or command prompt) inside this folder and run:
```bash
pip install -r requirements.txt
```

---

## How to Run

### Windows (Quick Start)
1. Double-click the **`dumper.bat`** file.
2. Enter the path to your JSON export file when prompted, **or leave it blank** and press **Enter** to automatically scrape your local Star Citizen installation logs.
3. Enter your Secret API Key (generate one in Settings under **BP Dumper**).
4. Enter the Supabase Webhook URL.

### macOS & Linux (Quick Start)
1. Open your terminal inside this folder and run:
   ```bash
   chmod +x dumper.sh dumper.py
   ./dumper.sh
   ```
2. Enter the path to your JSON export file when prompted, **or leave it blank** and press **Enter** to automatically scrape local Star Citizen log files.
3. Choose whether to perform a dry run (local only, no API key required).
4. Enter your Secret API Key and Supabase Webhook URL when prompted.

### Advanced Usage (CLI One-Liners)
You can pass arguments directly to **`dumper.bat`** (Windows) or **`dumper.sh`** (macOS/Linux) to bypass the prompts and run it in a single command. 

They accept all the same arguments as `dumper.py`:

```bash
# Dry Run Mode: Auto-detect and scan local Star Citizen logs (no API key required)
./dumper.sh --dry-run
# Windows: dumper.bat --dry-run

# Dry Run Mode: Scan a specific JSON export file
./dumper.sh /path/to/your/export.json --dry-run

# Real Mode: Auto-detect logs and import using environment key (webhook URL is built in)
export LOG_WATCHER_API_KEY="dr_your_secret_api_key"
./dumper.sh

# Real Mode: Scan specific Game.log file directly and pass key as parameter
./dumper.sh /path/to/Game.log --key "dr_your_secret_api_key"

# Optional: override webhook URL (e.g. local dev)
./dumper.sh --url "http://localhost/mock" --dry-run
```

---

## Output Description
The script will display the status of each unique blueprint:
- **`★ Would Import`**: (Dry run mode only) The blueprint was detected locally and is ready to import.
- **`★ Successfully Imported`**: The blueprint was added to your account.
- **`↻ Already Acquired`**: The blueprint was already present (skipped, no duplicate created).
- **`✗ Failed`**: The API returned an error (e.g., account pending approval, banned, or invalid ID).
