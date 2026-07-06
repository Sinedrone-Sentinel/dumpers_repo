# 🛰️ BP Dumper

A blazingly fast, zero-dependency cross-platform utility written in Go (with Python parity) to scan historical Star Citizen logs and trail active game notifications in real-time, syncing discovered blueprints instantly with your profile.

> [!TIP]
> **Client-Side Resolution Engine:** Includes built-in support for localized game mods (e.g. StarStrings). The utility auto-detects `global.ini` localization overrides, normalizes component prefixes (`Civ/0/A`, `Mil/1/A`, etc.), resolves nozzles (`Norfield`, `Harkin`), and maps them directly to canonical database IDs *before* transmitting.

---

## 🚀 Key Features

* **Wizard Setup:** Interactive configuration on first run with automated Star Citizen installation directory detection.
* **Env Persistence:** Bypasses the setup wizard automatically on subsequent runs by saving settings directly to `.env`.
* **Local Resolution:** Resolves ship component and nozzle modifications locally using client-side catalogs and `global.ini` parsing.
* **Watch Mode:** Active real-time tailing (`Game.log`) to push discovered blueprints to your webhook immediately as you play.
* **Dry Run Support:** Test scanning logs and printing mock import summaries without writing to the cloud or requiring an API key.

---

## 🛠️ Installation & Compilation

### Go version (Recommended)
Compile an optimized static binary for your current operating system:
```bash
cd scripts/bp-dumper-go
VERSION=$(node -p "require('../bp-dumper/version.json').version")
LDFLAGS="-X main.DumperVersion=${VERSION} -s -w"
# Build for your host OS
go build -ldflags="$LDFLAGS" -o bp-dumper
# Or build for Windows target from UNIX/macOS
GOOS=windows GOARCH=amd64 go build -ldflags="$LDFLAGS" -o bp-dumper-windows.exe
```

Pre-built binaries are published automatically on each semver tag — see `scripts/bp-dumper/README.md`.

### Python version
```bash
cd scripts/bp-dumper-py
uv pip install -r requirements.txt
uv run python dumper.py
```

---

## 📖 How to Run

### Interactive Wizard (First Run)
Simply run the executable with no flags. If `.env` is missing, the setup wizard will launch:
```bash
./bp-dumper
```

### Command Line Flags
Bypass `.env` values or override behavior directly:
```bash
# Dry Run Mode: Auto-detect and scan local Star Citizen logs (no API key required)
./bp-dumper --dry-run

# Run in Watch Mode (live tailing) using your API key
./bp-dumper --watch --key "dr_your_api_key"

# Scan a specific file directly
./bp-dumper /path/to/Game.log --key "dr_your_api_key"

# Rerun the configuration wizard to update settings
./bp-dumper --configure
```

---

## ⚙️ Environment Variables (`.env`)

You can create or modify a `.env` file in the dumper directory to configure the runner headlessly:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `LOG_WATCHER_API_KEY` | Your personal BP Dumper API key (from settings) | *None* |
| `SUPABASE_WEBHOOK_URL`| The target log-watcher edge function | *Direct project URL* |
| `WATCH_MODE` | Set `false` to disable live log tailing | `true` |

---

## Watch mode webhook events

While tailing `Game.log`, BP Dumper POSTs these events to the log-watcher webhook (in addition to `blueprint_received`):

| Event | When |
| :--- | :--- |
| `session_start` | Watch mode begins |
| `session_end` | Watch mode exits (Ctrl+C, process exit, log rotation) |
| `session_ping` | Every ~90s while watching (connection heartbeat) |
| `mission_started` | Contract accepted in-game |
| `mission_ended` | Mission complete, abandon, or fail |

The website **Live Mission Tracker** (`/targets/live`) subscribes to these updates via Supabase Realtime.

---

## 📊 Output Indicators

* **`★ Would Import`**: (Dry run only) Blueprint parsed and matched canonical catalog.
* **`★ Successfully Imported`**: Blueprint sent and saved to your account database.
* **`↻ Already Acquired`**: Skipped (already acquired on account).
* **`⚠ Notification sent — mark manually`**: Blueprint is ambiguous (will prompt site notification for manual resolution).
* **`✗ Unknown blueprint`**: Failed to resolve or match catalog (logged as failure).

