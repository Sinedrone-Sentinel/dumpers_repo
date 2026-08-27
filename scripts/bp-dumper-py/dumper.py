#!/usr/bin/env python3
"""
Import blueprints JSON export or directly scan Star Citizen log files to your account.
Works on macOS, Windows, and Linux. Requires Python 3.
"""

import argparse
from collections import deque
import concurrent.futures
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional, Any

def _resource_dir() -> Path:
    """Directory for read-only bundled files (lookup.json)."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


def _is_msix_packaged() -> bool:
    """True when running as a Microsoft Store / MSIX install (not portable exe)."""
    if sys.platform != "win32":
        return False
    if os.environ.get("PACKAGE_FAMILY_NAME") or os.environ.get("MsixPackageFamilyName"):
        return True
    try:
        parts = [p.lower() for p in Path(sys.executable).resolve().parts]
        return "windowsapps" in parts
    except OSError:
        return False


def _press_any_key_to_exit(message: str, *, code: int = 0) -> None:
    """Print a clear message, wait for a key, then exit (avoids Store 'flash crash')."""
    print()
    print(message)
    print()
    print("Press any key to exit...")
    try:
        if sys.platform == "win32":
            import msvcrt

            # Console Start/Store launches usually have a console; getch works even when
            # stdin is not a TTY. Non-interactive automation: brief sleep then exit.
            if sys.stdin.isatty() or getattr(sys, "stdout", None) and sys.stdout.isatty():
                msvcrt.getch()
            else:
                time.sleep(3)
        elif sys.stdin.isatty():
            input()
        else:
            time.sleep(3)
    except Exception:
        time.sleep(2)
    sys.exit(code)


def _exit_path_required() -> None:
    _press_any_key_to_exit(
        "Path required. Enter your Star Citizen LIVE folder (contains Game.log), "
        "or set LOG_PATH / --log-dir.\n"
        r"Example: C:\Program Files\Roberts Space Industries\StarCitizen\LIVE",
        code=1,
    )


def _exit_star_citizen_not_detected() -> None:
    _press_any_key_to_exit(
        "Star Citizen was not detected on this PC.\n"
        "Install Star Citizen (or point BP Dumper at your LIVE / Game.log path), then try again."
    )


def _prompt_live_path_until_valid(default_path: str = "") -> str:
    """Keep asking for LIVE / Game.log until auto-detect or a usable path succeeds."""
    print(f"{Colors.YELLOW}Star Citizen LIVE folder is required.{Colors.RESET}")
    print("Enter the LIVE folder that contains Game.log (not the RSI Launcher folder).")
    print(r"Example: C:\Program Files\Roberts Space Industries\StarCitizen\LIVE")
    print("Leave blank to auto-detect, or paste a path to override.")
    print()
    current_default = (default_path or "").strip()
    while True:
        path_prompt = "LIVE / Game.log path"
        if current_default:
            path_prompt += f" [{current_default}]"
        path_prompt += ": "
        try:
            user_path = input(path_prompt).strip().strip('"').strip("'")
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)
        if not user_path and current_default:
            user_path = current_default
        if not user_path:
            print(f"{Colors.DIM}Auto-detecting Star Citizen installations...{Colors.RESET}")
            installs = detect_sc_installs()
            if installs:
                chosen = "LIVE" if "LIVE" in installs else list(installs.keys())[0]
                detected = installs[chosen]
                print(f"{Colors.GREEN}Detected channel {chosen} at: {detected}{Colors.RESET}")
                return str(detected)
            fallback = Path(DEFAULT_WIN_PATH) / "LIVE"
            if fallback.is_dir():
                print(f"{Colors.GREEN}Detected default fallback at: {fallback}{Colors.RESET}")
                return str(fallback)
            print(f"{Colors.RED}Still not found — paste your LIVE folder path and press Enter.{Colors.RESET}")
            current_default = ""
            continue
        p = Path(user_path)
        if not p.exists():
            print(f"{Colors.RED}Path not found: {user_path}{Colors.RESET}")
            continue
        return str(p)


def _app_dir() -> Path:
    """Directory for user-writable files (.env, cache).

    Portable frozen exe: next to the exe.
    MSIX / Store install: %LOCALAPPDATA%\\BP Dumper (WindowsApps is not writable).
    Script checkout: next to dumper.py.
    """
    if _is_msix_packaged():
        base = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
        path = base / "BP Dumper"
        path.mkdir(parents=True, exist_ok=True)
        return path
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent

_LOOKUP_CANDIDATES = (
    "lookup.json",
    "blueprint-name-lookup.json",
)
# Canonical file lives in the repo; release zip ships a copy as lookup.json next to dumper.py.
_LOOKUP_FALLBACK_URL = (
    "https://raw.githubusercontent.com/Sinedrone-Sentinel/dumpers_repo/main/"
    "src/data/blueprint-name-lookup.json"
)
_cached: dict[str, Any] | None = None


def _find_local_lookup() -> Path | None:
    """Accept either the release name or the canonical repo filename — no rename required."""
    root = _resource_dir()
    for name in _LOOKUP_CANDIDATES:
        path = root / name
        if path.is_file():
            return path
    return None


def _ensure_lookup_file() -> Path:
    """Require a blueprint lookup JSON beside the script; download once if missing."""
    found = _find_local_lookup()
    if found is not None:
        return found
    if getattr(sys, "frozen", False):
        _press_any_key_to_exit(
            "Bundled lookup.json is missing from this build. Re-download DumperApps.exe "
            "from Dumper Apps → Downloads on the site.",
            code=1,
        )
    dest = _resource_dir() / "lookup.json"
    print()
    print("[ERROR] Missing blueprint name lookup next to dumper.py.")
    print("Expected one of: lookup.json  OR  blueprint-name-lookup.json")
    print("(Release zip BPDumper-python-scripts.zip includes lookup.json.)")
    print()
    print("Trying one-time download from the official repo…")
    try:
        req = urllib.request.Request(
            _LOOKUP_FALLBACK_URL,
            headers={"User-Agent": "BPDumper-python/lookup-fetch"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        if not data or data[:1] not in (b"{", b"["):
            raise RuntimeError("download did not look like JSON")
        dest.write_bytes(data)
        print(f"Saved lookup.json ({len(data)} bytes) — continuing.")
        print()
        return dest
    except Exception as exc:
        print(f"Download failed: {exc}")
        print()
        print("Fix manually (pick one):")
        print("  1) Download BPDumper-python-scripts.zip from GitHub Releases and extract it")
        print("  2) Put blueprint-name-lookup.json OR lookup.json next to dumper.py")
        print(f"     {_LOOKUP_FALLBACK_URL}")
        _press_any_key_to_exit("Cannot continue without the lookup file.", code=1)
        raise  # unreachable; keeps type-checkers happy


def _load_lookup() -> dict[str, Any]:
    global _cached
    if _cached is None:
        path = _ensure_lookup_file()
        with path.open(encoding="utf-8") as f:
            _cached = json.load(f)
    return _cached

def _normalize_display_key(value: str) -> str:
    """Strip grade prefix (Civ/1/C …) only. Keep quoted nicknames (e.g. 5SA 'Rhada')."""
    val = value.strip().lower()
    val = re.sub(r"^(?:civ|ind|mil|ste|com)/[0-9]/[a-d]\s+", "", val, flags=re.I)
    return val.strip()


_GRADE_PREFIX_RE = re.compile(r"^(?:civ|ind|mil|ste|com)/[0-9]/[a-d]\s+", re.I)

def normalize_internal_key(raw_input: str) -> str:
    normalized = raw_input.replace("\\", "/").strip().lower()
    if normalized.endswith(",p"):
        normalized = normalized[:-2]
    if normalized.startswith("bp_craft_"):
        normalized = normalized[9:]
    if normalized.endswith("_scitem.json"):
        normalized = normalized[:-12]
    elif normalized.endswith(".json"):
        normalized = normalized[:-5]
    elif normalized.endswith("_scitem"):
        normalized = normalized[:-7]
    return normalized

def _canonical_internal_key(raw_input: str) -> str:
    normalized = normalize_internal_key(raw_input)
    return normalized[7:] if normalized.startswith("scitem_") else normalized

STARSTRINGS_DISPLAY_ALIASES = {
    "lawson mining laser": "klein-sv mining laser",
    "pitman mining laser": "mining laser drak golem s1",
}

ABBREVIATED_MINING_PREFIXES = {
    "helix": "mining_laser_thcn_helix",
    "hofstede": "mining_laser_shin_hofstede",
    "klein": "mining_laser_shin_klein",
    "lawson": "mining_laser_shin_klein",
    "pitman": "mining_laser_drak_golem",
    "golem": "mining_laser_drak_golem",
}

def _resolve_from_internal_key(by_internal: dict[str, Any], internal_key: str) -> dict[str, Any] | None:
    entry = by_internal.get(internal_key)
    if not entry:
        return None
    return {
        "ok": True,
        "internal_name": internal_key,
        "blueprint_name": entry.get("blueprintName", internal_key),
    }

def _try_abbreviated_mining_laser_resolve(text: str, by_internal: dict[str, Any]) -> dict[str, Any] | None:
    trimmed = text.strip()
    size: int | None = None
    product = ""

    s00_match = re.match(r"(?i)^s00\s+(.+)$", trimmed)
    if s00_match:
        size = 0
        product = s00_match.group(1).strip().lower()
    else:
        size_match = re.match(r"(?i)^s(\d+)\s+(.+)$", trimmed)
        if not size_match:
            return None
        size = int(size_match.group(1))
        product = size_match.group(2).strip().lower()

    prefix = ABBREVIATED_MINING_PREFIXES.get(product)
    if prefix is None or size is None:
        return None
    return _resolve_from_internal_key(by_internal, f"{prefix}_s{size}")

def _try_starstrings_display_alias(text: str, data: dict[str, Any]) -> dict[str, Any] | None:
    alias_key = STARSTRINGS_DISPLAY_ALIASES.get(_normalize_display_key(text))
    if not alias_key:
        return None
    display_entry = data.get("byDisplayName", {}).get(alias_key)
    if not display_entry or display_entry.get("ambiguous"):
        return None
    if not display_entry.get("internalName"):
        return None
    return {
        "ok": True,
        "internal_name": display_entry["internalName"],
        "blueprint_name": display_entry.get("blueprintName", text),
    }


def _try_token_subset_display_resolve(text: str, data: dict[str, Any]) -> dict[str, Any] | None:
    """Match skin-first Game.log names to manufacturer-first catalog display names.

    Example: "BlackFire Racing Flight Suit" → "Neutrino Racing Flight Suit BlackFire"
    when query tokens are a unique subset with at most one extra catalog token (brand).
    """
    query_tokens = [t for t in _normalize_display_key(text).split() if t]
    if len(query_tokens) < 3:
        return None
    query_set = set(query_tokens)

    best_delta = None
    matches: list[dict[str, Any]] = []

    for key, entry in (data.get("byDisplayName") or {}).items():
        if not entry or entry.get("ambiguous") or not entry.get("internalName"):
            continue
        display_tokens = [t for t in str(key).split() if t]
        if len(display_tokens) < len(query_tokens):
            continue
        if not query_set.issubset(display_tokens):
            continue
        delta = len(display_tokens) - len(query_tokens)
        if delta < 0 or delta > 1:
            continue
        if best_delta is None or delta < best_delta:
            best_delta = delta
            matches = [entry]
        elif delta == best_delta:
            matches.append(entry)

    if len(matches) != 1:
        return None
    entry = matches[0]
    return {
        "ok": True,
        "internal_name": entry["internalName"],
        "blueprint_name": entry.get("blueprintName", text),
    }

def resolve_blueprint_input(raw_input: str, contract_definition_id: str | None = None) -> dict[str, Any]:
    data = _load_lookup()
    text = raw_input.strip()
    if not text:
        return {"ok": False, "error": "unknown_blueprint"}

    internal_key = _canonical_internal_key(text)
    by_internal = data.get("byInternalName", {})
    internal_match = _resolve_from_internal_key(by_internal, internal_key)
    if internal_match:
        return internal_match

    display_entry = data.get("byDisplayName", {}).get(_normalize_display_key(text))
    if not display_entry:
        alias_match = _try_starstrings_display_alias(text, data)
        if alias_match:
            return alias_match
        abbreviated_match = _try_abbreviated_mining_laser_resolve(text, by_internal)
        if abbreviated_match:
            return abbreviated_match
        subset_match = _try_token_subset_display_resolve(text, data)
        if subset_match:
            return subset_match
        return {"ok": False, "error": "unknown_blueprint", "display_name": text}

    if not display_entry.get("ambiguous"):
        return {
            "ok": True,
            "internal_name": display_entry["internalName"],
            "blueprint_name": display_entry.get("blueprintName", text),
        }

    candidates = list(display_entry.get("candidates") or [])
    prefix_match = re.match(r"^(?:civ|ind|mil|ste|com)/([0-9])/[a-d]\s+", text, flags=re.I)
    if prefix_match:
        size_digit = prefix_match.group(1)
        filtered = [c for c in candidates if c.get("categoryName") and f"S{size_digit}" in c["categoryName"]]
        if filtered:
            candidates = filtered

    contract_key = (contract_definition_id or "").strip().lower()
    if contract_key:
        pool_ids = set(data.get("byContractDefinitionId", {}).get(contract_key, []))
        if pool_ids:
            filtered = [c for c in candidates if c.get("internalName") in pool_ids]
            if filtered:
                candidates = filtered

    if len(candidates) == 1:
        c = candidates[0]
        return {
            "ok": True,
            "internal_name": c["internalName"],
            "blueprint_name": c.get("blueprintName", text),
        }

    display_name = display_entry.get("displayName") or text
    return {
        "ok": False,
        "error": "ambiguous_blueprint",
        "display_name": display_name,
    }

def cache_key_for_input(raw_input: str) -> str:
    result = resolve_blueprint_input(raw_input)
    if result.get("ok"):
        return result["internal_name"]
    return normalize_internal_key(raw_input)

def register_custom_translations(translations: dict[str, list[str]]):
    data = _load_lookup()
    by_display = data.setdefault("byDisplayName", {})
    by_internal = data.setdefault("byInternalName", {})
    for localized_name, internal_names in translations.items():
        if not internal_names:
            continue
        key = _normalize_display_key(localized_name)
        if not key:
            continue

        valid_candidates = []
        for raw_internal in internal_names:
            internal_name = _canonical_internal_key(raw_internal)
            entry = by_internal.get(internal_name)
            if not entry:
                continue
            valid_candidates.append({
                "internalName": internal_name,
                "blueprintName": entry.get("blueprintName", internal_name),
                "categoryName": entry.get("categoryName"),
            })
        if not valid_candidates:
            continue

        if len(valid_candidates) == 1:
            by_display[key] = valid_candidates[0]
        else:
            by_display[key] = {
                "ambiguous": True,
                "displayName": localized_name,
                "candidates": valid_candidates,
            }

def is_blueprint_acquired(acquired: set, raw_input: str) -> bool:
    key = cache_key_for_input(raw_input)
    return key in acquired or raw_input in acquired

class DumperUpdateRequired(Exception):
    """Server requires a newer BP Dumper build (HTTP 426)."""

    def __init__(self, latest: str = "", download_url: str = ""):
        self.latest = (latest or "").strip()
        self.download_url = (download_url or "").strip()
        super().__init__(f"update_required:{self.latest}")


def _load_dumper_version() -> str:
    try:
        from _version import __version__ as ver
        if ver:
            return str(ver)
    except ImportError:
        pass
    for name in ("dumper-version.json", "version.json"):
        path = _resource_dir() / name
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                ver = data.get("version")
                if ver:
                    return str(ver)
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                pass
    return "unknown"


def _parse_semver(version: str) -> tuple[int, ...]:
    cleaned = version.strip().lower().lstrip("v")
    parts: list[int] = []
    for piece in re.split(r"[.+_-]", cleaned):
        if not piece:
            continue
        digits = ""
        for ch in piece:
            if ch.isdigit():
                digits += ch
            else:
                break
        if not digits:
            break
        parts.append(int(digits))
    return tuple(parts or [0])


def _is_newer_version(latest: str, current: str) -> bool:
    return _parse_semver(latest) > _parse_semver(current)


DUMPER_VERSION = _load_dumper_version()
DEFAULT_WEBHOOK_URL = "https://dcyugmcvlmhlfmillzma.supabase.co/functions/v1/log-watcher-webhook"
DEFAULT_RELEASES_URL = "https://github.com/Sinedrone-Sentinel/dumpers_repo/releases"
DEFAULT_DOWNLOAD_URL = (
    "https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download/DumperApps.exe"
)

# Default Star Citizen path locations
DEFAULT_WIN_PATH = r"C:\Program Files\Roberts Space Industries\StarCitizen"
SCAN_MAX_DEPTH = 4
try:
    from _min_game_version import MIN_GAME_VERSION
except ImportError:
    MIN_GAME_VERSION = "4.8"


def _response_json(res) -> dict:
    try:
        body = res.json()
        return body if isinstance(body, dict) else {}
    except Exception:
        return {}


def raise_if_update_required(res) -> None:
    if res.status_code != 426:
        return
    body = _response_json(res)
    raise DumperUpdateRequired(
        str(body.get("latestDumperVersion") or ""),
        str(body.get("downloadUrl") or DEFAULT_DOWNLOAD_URL),
    )


def keep_app_up_to_date_enabled(env_vars: dict) -> bool:
    """Auto-download/self-replace removed (AV dropper heuristics). Always manual update."""
    return False


def perform_auto_update(latest_ver: str, download_url: str) -> None:
    """Removed: downloading/replacing the running exe tripped AV heuristics."""
    url = (download_url or DEFAULT_DOWNLOAD_URL).strip() or DEFAULT_DOWNLOAD_URL
    _press_any_key_to_exit(
        "[Update] Auto-update is disabled. Download manually:\n"
        f"  {url}\n"
        f"  Releases: {DEFAULT_RELEASES_URL}",
        code=1,
    )



def handle_update_required(err: DumperUpdateRequired, *, keep_up_to_date: bool) -> None:
    latest = err.latest or "newer"
    url = err.download_url or DEFAULT_DOWNLOAD_URL
    lines = [
        f"[Update required] This BP Dumper ({DUMPER_VERSION}) is outdated. Latest is {latest}."
    ]
    if _is_msix_packaged():
        lines.append(
            "Open Microsoft Store → Library (or the BP Dumper product page) and install the update."
        )
    else:
        lines.append("Download the new DumperApps.exe and replace this file:")
        lines.append(f"  {url}")
        lines.append(f"  Releases: {DEFAULT_RELEASES_URL}")
    _press_any_key_to_exit("\n".join(lines), code=1)


class SessionPingController:
    """Pause idle session_ping without stopping BP/mission event POSTs."""

    def __init__(self):
        self._lock = threading.Lock()
        self._paused = True
        self.update_required: DumperUpdateRequired | None = None

    def pause(self, reason: str = "") -> None:
        with self._lock:
            was = self._paused
            self._paused = True
        if not was and reason:
            print(f"  [Live] {Colors.DIM}Session ping paused ({reason}){Colors.RESET}")

    def resume(self, reason: str = "") -> None:
        with self._lock:
            was = self._paused
            self._paused = False
        if was and reason:
            print(f"  [Live] {Colors.DIM}Session ping resumed ({reason}){Colors.RESET}")

    def is_paused(self) -> bool:
        with self._lock:
            return self._paused

    def note_update_required(self, err: DumperUpdateRequired) -> None:
        with self._lock:
            self.update_required = err

    def take_update_required(self) -> DumperUpdateRequired | None:
        with self._lock:
            err = self.update_required
            self.update_required = None
            return err


def post_blueprint_event(session, url: str, blueprint_input: str, contract_definition_id: str | None = None):
    """POST blueprint: resolve locally first (so local global.ini translations and prefix stripping work), fall back to raw."""
    post_value = blueprint_input
    local = resolve_blueprint_input(blueprint_input, contract_definition_id)
    if local.get("ok"):
        post_value = local["internal_name"]

    payload = {
        "type": "blueprint_received",
        "blueprint": post_value,
    }
    if contract_definition_id:
        payload["contractDefinitionId"] = contract_definition_id

    res = session.post(url, json=payload, timeout=15)
    raise_if_update_required(res)
    body = _response_json(res)
    internal_name = body.get("blueprint") or (local["internal_name"] if local.get("ok") else None)
    error_msg = None
    if res.status_code == 400:
        err = body.get("error", "Unknown blueprint")
        error_msg = f'{err} (posted: "{post_value}")'
    elif res.status_code >= 400 and res.status_code != 202:
        err = body.get("error", f"HTTP {res.status_code}")
        error_msg = f"{err} (posted: \"{post_value}\")"
    return res.status_code, body.get("duplicate", False), internal_name, error_msg


def post_dumper_event(session, url: str, event_type: str, fields: dict | None = None):
    payload = {"type": event_type}
    if fields:
        payload.update({k: v for k, v in fields.items() if v is not None})
    res = session.post(url, json=payload, timeout=15)
    raise_if_update_required(res)
    if res.status_code >= 400:
        raise RuntimeError(f"HTTP {res.status_code}")


def start_session_ping_loop(
    session,
    url: str,
    stop_event: threading.Event,
    ping_ctrl: SessionPingController,
):
    # Keep well under the server stale timeout (~120s) while live in PU.
    while not stop_event.wait(30.0):
        if ping_ctrl.is_paused():
            continue
        try:
            post_dumper_event(session, url, "session_ping")
        except DumperUpdateRequired as e:
            ping_ctrl.note_update_required(e)
            ping_ctrl.pause("update required")
            return
        except Exception as e:
            print(f"  [Live] {Colors.YELLOW}⚠ Session ping failed:{Colors.RESET} {e}")

# Skip system/cache folders during drive scans
SCAN_SKIP_DIRS = frozenset(name.lower() for name in (
    "windows", "windows.old", "winsxs",
    "$recycle.bin", "$winreagent", "$sysreset", "$getcurrent",
    "system volume information", "config.msi", "recovery", "boot",
    "programdata", "appdata",
    "perflogs", "onedrivetemp",
    "node_modules", ".git", ".svn", ".hg",
))

SC_ROOT_NAMES = frozenset(("starcitizen", "star citizen"))
KNOWN_CHANNEL_NAMES = frozenset(("LIVE", "PTU", "EPTU", "HOTFIX", "TECH-PREVIEW"))

# ANSI colors for nice terminal feedback
class Colors:
    GREEN = "\033[92m"
    CYAN = "\033[96m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    MAGENTA = "\033[95m"
    DIM = "\033[2m"
    RESET = "\033[0m"

def disable_colors():
    """No-op colors for environments that do not support them."""
    Colors.GREEN = ""
    Colors.CYAN = ""
    Colors.YELLOW = ""
    Colors.RED = ""
    Colors.MAGENTA = ""
    Colors.DIM = ""
    Colors.RESET = ""

def _is_channel_dir(p: Path) -> bool:
    if p.name.upper() in KNOWN_CHANNEL_NAMES:
        return True
    try:
        return (p / "build_manifest.id").is_file()
    except OSError:
        return False

def _looks_like_sc_root(p: Path) -> bool:
    try:
        for child in p.iterdir():
            if child.is_dir() and _is_channel_dir(child):
                return True
    except OSError:
        pass
    return False

def _find_sc_roots(drive_root: Path, max_depth: int = SCAN_MAX_DEPTH) -> list[Path]:
    roots = []
    queue_dirs = deque([(drive_root, 0)])
    while queue_dirs:
        current, depth = queue_dirs.popleft()
        try:
            entries = list(current.iterdir())
        except (OSError, PermissionError):
            continue
        for entry in entries:
            try:
                if not entry.is_dir():
                    continue
            except OSError:
                continue
            name_lower = entry.name.lower()
            if name_lower in SCAN_SKIP_DIRS:
                continue
            if name_lower in SC_ROOT_NAMES and _looks_like_sc_root(entry):
                roots.append(entry)
                continue
            if depth + 1 < max_depth:
                queue_dirs.append((entry, depth + 1))
    return roots

def detect_sc_installs() -> dict[str, Path]:
    if sys.platform != "win32":
        return {}

    import ctypes
    import string

    DRIVE_FIXED = 3
    try:
        get_drive_type = ctypes.windll.kernel32.GetDriveTypeW
    except (AttributeError, OSError):
        return {}

    found = {}
    for letter in string.ascii_uppercase:
        root_str = f"{letter}:\\"
        try:
            if get_drive_type(root_str) != DRIVE_FIXED:
                continue
        except OSError:
            continue
        for sc_root in _find_sc_roots(Path(root_str)):
            try:
                children = list(sc_root.iterdir())
            except OSError:
                continue
            for channel_dir in children:
                if not channel_dir.is_dir() or not _is_channel_dir(channel_dir):
                    continue
                channel = channel_dir.name.upper()
                if channel not in found:
                    found[channel] = channel_dir
    return found


# Log parsing patterns & structures
PATTERN_TIMESTAMP = re.compile(r"^<([0-9T:\-.Z]+)>")
PATTERN_MARKER = re.compile(
    r"CreateMarker.*missionId \[([^\]]+)\].*generator name \[([^\]]+)\].*contract \[([^\]]+)\]"
)
PATTERN_MARKER_DEF_ID = re.compile(r"contractDefinitionId\[([^\]]+)\]")
PATTERN_MISSION_GENERATOR = re.compile(r"generator name \[([^\]]+)\]")
PATTERN_MISSION_CONTRACT = re.compile(
    r"missionId \[([^\]]+)\].*contract \[([^\]]+)\]"
)
PATTERN_ACCEPTED = re.compile(
    r'Added notification "Contract Accepted:\s*(?P<title>.*?)\s*MissionId:\s*\[(?P<guid>[^\]]+)\]'
)
PATTERN_ACCEPTED_FALLBACK = re.compile(
    r'Added notification "Contract Accepted:.*?MissionId:\s*\[(?P<guid>[^\]]+)\]'
)
PATTERN_END_MISSION = re.compile(
    r"<EndMission>.*MissionId\[([^\]]+)\].*CompletionType\[(\w+)\].*Reason\[([^\]]+)\]"
)
PATTERN_BLUEPRINT = re.compile(r'Added notification "Received Blueprint: ([^:]+):')
PATTERN_EXIT_MENU = re.compile(r"Requesting game mode Frontend_Main/SC_Frontend")
# Pause session_ping after this many seconds with no mission/BP/PU activity (still watch logs).
MISSION_IDLE_PAUSE_SEC = 3600.0
# AFK / inactivity kick (seen before Frontend_Main in Game.log).
PATTERN_PLAYER_INACTIVE = re.compile(r"Remote Disconnect - player inactive")
PATTERN_CRASH = re.compile(r"Cloud Imperium Games public crash handler taking over")
PATTERN_LOG_STARTED = re.compile(r"Log started on")
# PU load: system name in log (Pyro, Nyx, pu, Stanton, …) with any SC_* gamerules tag.
PATTERN_LOADING_PU = re.compile(
    r"Loading screen for (?!Frontend_Main\b)[^:\n]+ : SC_\w+ closed",
    re.IGNORECASE,
)
# Fresh launch / relaunch sometimes reaches PU via SC_Default before the loading-screen line.
PATTERN_PU_ENTERED = re.compile(
    r'taskname="OnClientEnteredGame".*gamerules="SC_(?!Frontend)\w+"',
)

# A crash (Alt+F4 / game crash) preserves missions server-side, but only if the
# player reconnects within this window. Exit-to-menu, by contrast, clears missions.
CRASH_RECOVERY_WINDOW_SEC = 1800.0

BLUEPRINT_CORRELATION_WINDOW_SEC = 5.0

REP_IN_TITLE_RE = re.compile(r"\[(\d+)\s*/\s*(\d+)\s*(?:rep|Rep|REP)?\]", re.I)
LOG_NOISE_TAIL_RE = re.compile(r'\s:\s*"\s*\[\d+\]\s*To Queue|\[\d+\]\s*To Queue', re.I)


def normalize_accept_notification_title(raw: str | None) -> str | None:
    """Keep mission name + rep bracket; drop HTML and engine queue noise from Game.log."""
    if not raw:
        return None
    text = re.sub(r"<[^>]+>", "", raw.strip())
    rep = REP_IN_TITLE_RE.search(text)
    if rep:
        before = text[: rep.start()].strip().rstrip(':"\' ')
        if before:
            return f"{before} [{rep.group(1)}/{rep.group(2)} Rep]"
    text = LOG_NOISE_TAIL_RE.split(text, maxsplit=1)[0].strip().rstrip(':"\' ,')
    return text or None


def is_pu_entry_line(line: str) -> bool:
    """True when Game.log indicates the player finished loading into the PU."""
    return bool(PATTERN_LOADING_PU.search(line) or PATTERN_PU_ENTERED.search(line))


class MissionEntry:
    def __init__(self, debug_name: str, generator: str, contract_definition_id=None):
        self.debug_name = debug_name
        self.generator = generator
        self.contract_definition_id = contract_definition_id

class ActiveMission:
    def __init__(self, guid: str, debug_name: str, generator: str, start_ts: float, contract_definition_id=None):
        self.guid = guid
        self.debug_name = debug_name
        self.generator = generator
        self.start_ts = start_ts
        self.contract_definition_id = contract_definition_id

class MissionLifecycleEvent:
    def __init__(self, trigger: str, guid: str, debug_name: str, ts: float, contract_definition_id=None):
        self.trigger = trigger
        self.guid = guid
        self.debug_name = debug_name
        self.ts = ts
        self.contract_definition_id = contract_definition_id

class WatcherState:
    def __init__(self) -> None:
        self.guid_map = {}
        self.active = {}
        self.recent_lifecycle = deque(maxlen=32)

    def record_marker(self, guid: str, generator: str, contract: str, contract_definition_id=None) -> None:
        existing = self.guid_map.get(guid)
        if existing:
            if contract and existing.debug_name in ("", "Unknown"):
                existing.debug_name = contract
            if generator and existing.generator in ("", "Unknown"):
                existing.generator = generator
            if contract_definition_id and not existing.contract_definition_id:
                existing.contract_definition_id = contract_definition_id
            return
        self.guid_map[guid] = MissionEntry(
            debug_name=contract,
            generator=generator,
            contract_definition_id=contract_definition_id,
        )

    def record_accepted(self, guid: str, ts: float, title: str | None = None) -> ActiveMission:
        entry = self.guid_map.get(guid)
        accept_title = (title or "").strip()
        if accept_title:
            if entry:
                entry.debug_name = accept_title
            else:
                entry = MissionEntry(debug_name=accept_title, generator="", contract_definition_id=None)
                self.guid_map[guid] = entry
        debug_name = accept_title or (entry.debug_name if entry else "") or "Unknown"
        generator = entry.generator if entry else "Unknown"
        def_id = entry.contract_definition_id if entry else None
        active = ActiveMission(
            guid=guid,
            debug_name=debug_name,
            generator=generator,
            start_ts=ts,
            contract_definition_id=def_id,
        )
        self.active[guid] = active
        self.recent_lifecycle.append(
            MissionLifecycleEvent(
                trigger="accept",
                guid=guid,
                debug_name=debug_name,
                ts=ts,
                contract_definition_id=def_id,
            )
        )
        return active

    def record_end(self, guid: str, completion: str, ts: float) -> Optional[ActiveMission]:
        active = self.active.pop(guid, None)
        entry = self.guid_map.get(guid)
        debug_name = active.debug_name if active else (entry.debug_name if entry else "Unknown")
        def_id = (
            active.contract_definition_id if active
            else (entry.contract_definition_id if entry else None)
        )
        if completion == "Complete":
            self.recent_lifecycle.append(
                MissionLifecycleEvent(
                    trigger="complete",
                    guid=guid,
                    debug_name=debug_name,
                    ts=ts,
                    contract_definition_id=def_id,
                )
            )
        return active

    def clear_all_active(self) -> None:
        self.active.clear()

    def correlate_blueprint(self, ts: float) -> Optional[MissionLifecycleEvent]:
        best = None
        best_delta = BLUEPRINT_CORRELATION_WINDOW_SEC + 1.0
        for e in self.recent_lifecycle:
            delta = ts - e.ts
            if 0.0 <= delta <= BLUEPRINT_CORRELATION_WINDOW_SEC and delta < best_delta:
                best = e
                best_delta = delta
        return best

class SessionTracker:
    def __init__(self) -> None:
        self.crash_at: float | None = None
        self.paused_reason = ""
        self.pending_status = ""
        self.last_log_ts: float | None = None

    def reset(self) -> None:
        self.crash_at = None
        self.paused_reason = ""
        self.pending_status = ""
        self.last_log_ts = None

    def resolve_timestamp(self, line: str) -> float:
        ts = parse_log_timestamp(line)
        if ts is not None:
            self.last_log_ts = ts
            return ts
        if self.last_log_ts is not None:
            return self.last_log_ts
        return time.time()

    def on_log_rotation(self, state: "WatcherState") -> None:
        state.clear_all_active()
        self.crash_at = None
        self.paused_reason = "quit_game"
        self.pending_status = "quit_game"
        self.last_log_ts = None

    def on_mission_accepted(self) -> None:
        """Accepting a contract implies the player is in the PU — override stale menu state."""
        self.pending_status = "tracking"
        self.paused_reason = ""
        self.crash_at = None

    def mark_back_in_pu(self, state: "WatcherState", ts: float) -> None:
        if self.crash_at is not None and ts - self.crash_at > CRASH_RECOVERY_WINDOW_SEC:
            state.clear_all_active()
        self.paused_reason = ""
        self.crash_at = None
        self.pending_status = "tracking"

    def resume_from_pause(self, state: "WatcherState", ts: float) -> str:
        """Player left menu/crash-wait and is back in the PU."""
        if not self.paused_reason and self.crash_at is None:
            return ""
        self.mark_back_in_pu(state, ts)
        return "game_reconnected"

    def process_line(self, line: str, ts: float, state: "WatcherState") -> str:
        if PATTERN_LOG_STARTED.search(line):
            state.clear_all_active()
            self.paused_reason = "quit_game"
            self.crash_at = None
            self.pending_status = "quit_game"
            return "game_quit"
        if PATTERN_EXIT_MENU.search(line):
            # Returning to the menu abandons all in-progress missions server-side.
            state.clear_all_active()
            self.paused_reason = "exit_menu"
            self.crash_at = None
            self.pending_status = "exit_menu"
            return "game_exit_menu"
        if PATTERN_PLAYER_INACTIVE.search(line):
            # Inactivity kick: same pause as menu; Frontend_Main usually follows shortly.
            state.clear_all_active()
            self.paused_reason = "exit_menu"
            self.crash_at = None
            self.pending_status = "exit_menu"
            return "game_exit_menu"
        if PATTERN_CRASH.search(line):
            self.crash_at = ts
            if time.time() - ts > CRASH_RECOVERY_WINDOW_SEC:
                self.crash_at = None
                return ""
            self.pending_status = "crash_waiting"
            return "game_crash"
        if is_pu_entry_line(line):
            return self.resume_from_pause(state, ts)
        return ""

    def pending_status_event(self, now: float | None = None) -> str:
        now = now if now is not None else time.time()
        if self.pending_status == "crash_waiting" and self._is_crash_recovery_expired(now):
            self.pending_status = ""
            self.crash_at = None
            return ""
        mapping = {
            "tracking": "game_tracking",
            "exit_menu": "game_exit_menu",
            "quit_game": "game_quit",
            "crash_waiting": "game_crash",
        }
        return mapping.get(self.pending_status, "")

    def resolve_startup_game_status(self, state: "WatcherState") -> str:
        """After log replay, prefer tracking when accepted missions are still open."""
        if state.active:
            return "game_tracking"
        return self.pending_status_event()

    def _is_crash_recovery_expired(self, now: float) -> bool:
        return self.crash_at is not None and now - self.crash_at > CRASH_RECOVERY_WINDOW_SEC

    def finalize_after_reconcile(self, state: "WatcherState", now: float | None = None) -> None:
        now = now if now is not None else time.time()
        if not self._is_crash_recovery_expired(now):
            return
        state.clear_all_active()
        self.crash_at = None
        if self.pending_status == "crash_waiting":
            self.pending_status = ""

    def expire_stale_crash_if_needed(self, state: "WatcherState", now: float | None = None) -> str:
        now = now if now is not None else time.time()
        if self.pending_status != "crash_waiting" or not self._is_crash_recovery_expired(now):
            return ""
        state.clear_all_active()
        self.crash_at = None
        self.pending_status = ""
        return "game_tracking"

def parse_log_timestamp(line: str) -> Optional[float]:
    m = PATTERN_TIMESTAMP.match(line)
    if not m:
        return None
    raw = m.group(1).replace("Z", "+00:00")
    try:
        from datetime import datetime
        return datetime.fromisoformat(raw).timestamp()
    except ValueError:
        return None

def parse_blueprints_from_log(path: Path) -> list[tuple[str, str | None]]:
    """Return (product_name, contract_definition_id) pairs for history import."""
    discovered: list[tuple[str, str | None]] = []
    state = WatcherState()
    try:
        with open(path, "rb") as f:
            for raw in f:
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                if not line:
                    continue
                ts = parse_log_timestamp(line) or 0.0

                if active := apply_mission_log_line(line, state, ts):
                    ts_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts)) if ts else time.strftime("%Y-%m-%d %H:%M:%S")
                    print(f"  [{ts_str}] [{path.name}] {Colors.GREEN}Mission started: {active.debug_name} ({active.guid}){Colors.RESET}")

                elif m := PATTERN_END_MISSION.search(line):
                    guid, completion, reason = m.group(1), m.group(2), m.group(3)
                    active = state.record_end(guid, completion, ts)
                    entry = state.guid_map.get(guid)
                    debug_name = active.debug_name if active else (entry.debug_name if entry else "Unknown")
                    ts_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts)) if ts else time.strftime("%Y-%m-%d %H:%M:%S")
                    
                    if completion == "Complete":
                        print(f"  [{ts_str}] [{path.name}] {Colors.CYAN}Mission complete: {debug_name} ({guid}) [{reason}]{Colors.RESET}")
                    elif completion == "Abandon":
                        print(f"  [{ts_str}] [{path.name}] {Colors.RED}Mission abandoned: {debug_name} ({guid}) [{reason}]{Colors.RESET}")
                    elif completion == "Fail":
                        print(f"  [{ts_str}] [{path.name}] {Colors.YELLOW}Mission failed: {debug_name} ({guid}) [{reason}]{Colors.RESET}")
                    else:
                        print(f"  [{ts_str}] [{path.name}] {Colors.YELLOW}Mission ended ({completion}): {debug_name} ({guid}) [{reason}]{Colors.RESET}")

                elif m := PATTERN_BLUEPRINT.search(line):
                    product_name = m.group(1).strip()
                    corr = state.correlate_blueprint(ts)
                    ts_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts)) if ts else time.strftime("%Y-%m-%d %H:%M:%S")
                    if corr:
                        print(f"  [{ts_str}] [{path.name}] {Colors.MAGENTA}Blueprint received: {Colors.GREEN}{product_name}{Colors.RESET}{Colors.MAGENTA} (from {corr.debug_name} on {corr.trigger}){Colors.RESET}")
                    else:
                        print(f"  [{ts_str}] [{path.name}] {Colors.MAGENTA}Blueprint received: {Colors.GREEN}{product_name}{Colors.RESET}{Colors.MAGENTA} (no recent mission to correlate){Colors.RESET}")
                    
                    contract_id = corr.contract_definition_id if corr else None
                    discovered.append((product_name, contract_id))
    except OSError as e:
        print(f"{Colors.YELLOW}Warning: Could not read log file {path.name} ({e}){Colors.RESET}")
    return discovered


def coalesce_discovered_blueprints(
    items: list[tuple[str, str | None]],
) -> list[tuple[str, str | None]]:
    """Dedupe discoveries; prefer graded names and keep a contract id when available."""
    by_key: dict[str, tuple[str, str | None]] = {}
    for name, contract_id in items:
        key = _normalize_display_key(name)
        if not key:
            continue
        prev = by_key.get(key)
        if prev is None:
            by_key[key] = (name, contract_id)
            continue
        prev_name, prev_contract = prev
        has_grade = bool(_GRADE_PREFIX_RE.match(name.strip()))
        prev_has_grade = bool(_GRADE_PREFIX_RE.match(prev_name.strip()))
        if has_grade and not prev_has_grade:
            pick_name = name
        elif prev_has_grade and not has_grade:
            pick_name = prev_name
        else:
            pick_name = prev_name
        pick_contract = contract_id or prev_contract
        by_key[key] = (pick_name, pick_contract)
    return sorted(by_key.values(), key=lambda row: row[0].lower())

def process_log_file(task_info):
    """Worker function for a single thread to process one file.

    task_info: (index, total, path) or (index, total, path, skip_version_check)
    """
    if len(task_info) == 4:
        index, total, path, skip_version_check = task_info
    else:
        index, total, path = task_info
        skip_version_check = False
    if not skip_version_check and not is_log_version_allowed(path, MIN_GAME_VERSION):
        print(f"  [{index:>3}/{total}] Skipping {path.name} (game version is below minimum {MIN_GAME_VERSION})")
        return []
    size_mb = path.stat().st_size / (1024 * 1024)
    version_note = " [no version filter]" if skip_version_check else ""
    print(f"  [{index:>3}/{total}] Scanning {path.name} ({size_mb:.2f} MB){version_note}...")
    return parse_blueprints_from_log(path)


def resolve_sc_channel_dir(args, env_vars: dict) -> Path | None:
    """Best-effort LIVE (or first detected) channel directory for log scans."""
    if args.log_dir and args.log_dir.is_dir():
        return args.log_dir
    if args.file_path:
        if args.file_path.is_dir():
            return args.file_path
        if args.file_path.is_file():
            return args.file_path.parent
    backup_p = env_vars.get("BACKUP_PATH")
    if backup_p:
        return Path(backup_p).parent
    installs = detect_sc_installs()
    if installs:
        chosen_channel = "LIVE" if "LIVE" in installs else list(installs.keys())[0]
        return installs[chosen_channel]
    fallback = Path(DEFAULT_WIN_PATH)
    if fallback.is_dir():
        live_dir = fallback / "LIVE"
        if live_dir.is_dir():
            return live_dir
    return None


def is_import_log_file(path: Path) -> bool:
    """True for Game.log, *.log, and rotated names like Game.log.1."""
    if not path.is_file():
        return False
    name = path.name.lower()
    return name.endswith(".log") or ".log." in name


def _iter_import_log_paths(directory: Path) -> list[Path]:
    """Top-level logs, plus recursive scan when the folder is logbackups."""
    try:
        if directory.name.lower() == "logbackups":
            return [p for p in directory.rglob("*") if is_import_log_file(p)]
        return [p for p in directory.iterdir() if is_import_log_file(p)]
    except OSError:
        return []


def collect_log_files_for_import(log_dirs: list[Path], *, include_game_log: bool) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for d in log_dirs:
        if not d.is_dir():
            continue
        for p in sorted(_iter_import_log_paths(d), key=lambda x: x.name.lower()):
            if not include_game_log and p.name == "Game.log":
                continue
            try:
                resolved = p.resolve()
            except OSError:
                resolved = p
            if resolved in seen:
                continue
            seen.add(resolved)
            files.append(p)
    return files


def upload_discovered_blueprints(
    unique_bps: list[tuple[str, str | None]] | list[str],
    *,
    session,
    url: str,
    acquired_blueprints: set,
    cache_path: Path,
    dry_run: bool,
    label: str = "blueprint",
) -> None:
    """Post unique product names not already acquired; updates local cache on success."""
    rows: list[tuple[str, str | None]] = []
    for item in unique_bps:
        if isinstance(item, tuple):
            rows.append((item[0], item[1] if len(item) > 1 else None))
        else:
            rows.append((item, None))

    to_send = [(bp, cid) for bp, cid in rows if not is_blueprint_acquired(acquired_blueprints, bp)]
    if not to_send:
        print(f"All discovered {label}s already acquired.")
        return

    print(f"Uploading {len(to_send)} {label}(s)...")
    success_count = 0
    dupe_count = 0
    fail_count = 0
    for idx, (bp_id, contract_id) in enumerate(to_send, 1):
        if dry_run:
            success_count += 1
            resolved = resolve_blueprint_input(bp_id, contract_id)
            item_label = bp_id
            if resolved.get("ok"):
                item_label = f"{resolved['blueprint_name']} → {resolved['internal_name']}"
            elif resolved.get("error") == "ambiguous_blueprint":
                item_label = f"{bp_id} (ambiguous — would notify)"
            print(f"  [{idx}/{len(to_send)}] {Colors.GREEN}★ Would Import:{Colors.RESET} {item_label}")
            continue
        try:
            status, is_duplicate, internal_name, error_msg = post_blueprint_event(
                session, url, bp_id, contract_id
            )
            if status == 200:
                if is_duplicate:
                    dupe_count += 1
                    print(f"  [{idx}/{len(to_send)}] {Colors.YELLOW}↻ Already Acquired:{Colors.RESET} {bp_id}")
                else:
                    success_count += 1
                    print(f"  [{idx}/{len(to_send)}] {Colors.GREEN}★ Successfully Imported:{Colors.RESET} {bp_id}")
                if internal_name:
                    acquired_blueprints.add(internal_name)
                    save_cache_file(cache_path, acquired_blueprints)
            elif status == 202:
                success_count += 1
                print(f"  [{idx}/{len(to_send)}] {Colors.YELLOW}⚠ Notification sent — mark manually:{Colors.RESET} {bp_id}")
            elif error_msg:
                fail_count += 1
                print(f"  [{idx}/{len(to_send)}] {Colors.RED}✗ {error_msg}{Colors.RESET}")
            else:
                fail_count += 1
                print(f"  [{idx}/{len(to_send)}] {Colors.RED}✗ Failed:{Colors.RESET} {bp_id} (HTTP {status})")
        except Exception as e:
            fail_count += 1
            print(f"  [{idx}/{len(to_send)}] {Colors.RED}✗ Connection Error:{Colors.RESET} {bp_id} ({e})")

    print(
        f"\nImport complete: {Colors.GREEN}{success_count} successfully imported{Colors.RESET}, "
        f"{Colors.YELLOW}{dupe_count} already acquired{Colors.RESET}, "
        f"{Colors.RED}{fail_count} failed{Colors.RESET}"
    )


def run_log_folder_blueprint_import(
    log_dirs: list[Path],
    *,
    session,
    url: str,
    acquired_blueprints: set,
    cache_path: Path,
    dry_run: bool,
    include_game_log: bool,
    skip_version_check: bool,
    banner: str,
) -> bool:
    """Scan .log files under log_dirs and upload discovered blueprints. Returns True if work ran."""
    print(f"\n{Colors.CYAN}{banner}{Colors.RESET}")
    files_to_scan = collect_log_files_for_import(log_dirs, include_game_log=include_game_log)
    if not files_to_scan:
        print("No historical logs to scan.")
        return True

    total_bytes = sum(p.stat().st_size for p in files_to_scan if p.is_file())
    print(
        f"Scanning {len(files_to_scan)} log file(s) "
        f"({total_bytes / (1024 ** 3):.2f} GB total)"
        f"{' — version filter OFF' if skip_version_check else f' — min game version {MIN_GAME_VERSION}'}..."
    )

    for d in log_dirs:
        if d.is_dir():
            local_loc_map = parse_local_localization(d)
            if local_loc_map:
                register_custom_translations(local_loc_map)

    all_bps: list[tuple[str, str | None]] = []
    work_items = [
        (i, len(files_to_scan), path, skip_version_check)
        for i, path in enumerate(files_to_scan, 1)
    ]
    with concurrent.futures.ThreadPoolExecutor() as executor:
        for res in executor.map(process_log_file, work_items):
            all_bps.extend(res)

    unique_old = coalesce_discovered_blueprints(all_bps)
    if not unique_old:
        print("No blueprints found in historical logs.")
        return True

    print(f"Found {len(unique_old)} unique blueprint award name(s) across scanned logs.")
    upload_discovered_blueprints(
        unique_old,
        session=session,
        url=url,
        acquired_blueprints=acquired_blueprints,
        cache_path=cache_path,
        dry_run=dry_run,
        label="historical blueprint",
    )
    return True

def load_env_file(env_path: Path) -> dict:
    env = {}
    if env_path.is_file():
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        env[k.strip()] = v.strip().strip('"').strip("'")
        except Exception:
            pass
    return env

def save_env_file(env_path: Path, variables: dict):
    try:
        with open(env_path, "w", encoding="utf-8") as f:
            f.write("# Saved Configuration Settings\n")
            for k, v in variables.items():
                if v:
                    # Strip quotes before saving
                    clean_v = str(v).strip().strip('"').strip("'")
                    f.write(f"{k}={clean_v}\n")
    except Exception:
        pass

def load_cache_file(cache_path: Path) -> set:
    if cache_path.is_file():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return set(data)
        except Exception:
            pass
    return set()

def save_cache_file(cache_path: Path, cache_set: set):
    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(sorted(list(cache_set)), f, indent=2)
    except Exception:
        pass

def apply_mission_log_line(line: str, state: WatcherState, ts: float) -> ActiveMission | None:
    """Parse mission marker / accept / end lines. Returns active mission when accepted."""
    if m := PATTERN_MISSION_CONTRACT.search(line):
        gen_match = PATTERN_MISSION_GENERATOR.search(line)
        generator = gen_match.group(1) if gen_match else ""
        def_id_match = PATTERN_MARKER_DEF_ID.search(line)
        def_id = def_id_match.group(1) if def_id_match else None
        state.record_marker(m.group(1), generator, m.group(2), def_id)
        return None

    if m := PATTERN_ACCEPTED.search(line):
        accept_title = normalize_accept_notification_title(m.group("title"))
        return state.record_accepted(m.group("guid"), ts, title=accept_title)

    if m := PATTERN_ACCEPTED_FALLBACK.search(line):
        return state.record_accepted(m.group("guid"), ts)

    if m := PATTERN_END_MISSION.search(line):
        state.record_end(m.group(1), m.group(2), ts)
        return None

    return None


def apply_watch_line_to_state(line: str, state: WatcherState, session: SessionTracker | None, ts: float) -> ActiveMission | None:
    if session is not None:
        session.process_line(line, ts, state)
    active = apply_mission_log_line(line, state, ts)
    if active and session is not None:
        session.on_mission_accepted()
    return active


def reconcile_active_missions_from_log(path: Path, state: WatcherState, session: SessionTracker | None = None) -> None:
    """Rebuild active missions from Game.log, honoring PU session boundaries.

    A mission is only active if it was accepted (and not ended) within the current
    PU session. Exit-to-menu / quit clears all active missions; a crash preserves
    them unless the reconnect (or end of log) is more than CRASH_RECOVERY_WINDOW_SEC
    after the crash. This prevents ghost missions that were lost to a menu boot or a
    stale crash from being resurrected on every full-log replay.
    """
    state.active.clear()
    state.guid_map.clear()
    state.recent_lifecycle.clear()

    replay = SessionTracker()
    with open(path, "r", encoding="utf-8", errors="replace") as log_file:
        for line in log_file:
            line = line.rstrip("\r\n")
            if not line:
                continue
            ts = replay.resolve_timestamp(line)
            # Process session transitions first so menu/quit clears land before any
            # accept on the same line (accept lines are not session lines, so order
            # is safe), then record mission accept/marker/end.
            replay.process_line(line, ts, state)
            if apply_mission_log_line(line, state, ts):
                replay.on_mission_accepted()

    # If the log ended mid-crash and the window has elapsed, drop the stale missions.
    replay.finalize_after_reconcile(state)

    if session is not None and state.active:
        session.on_mission_accepted()


def ensure_awaiting_pu(session_tracker: SessionTracker) -> None:
    """After a new/rotated log with no PU markers yet, stay paused until entry lines arrive."""
    if is_live_mission_sync_ready(session_tracker):
        return
    if not session_tracker.paused_reason and not session_tracker.pending_status:
        session_tracker.paused_reason = "quit_game"
        session_tracker.pending_status = "quit_game"


def seed_session_tracker_from_log(path: Path, session_tracker: SessionTracker, state: WatcherState) -> None:
    """Replay session markers so startup reflects the latest menu/PU phase in Game.log.

    Uses a throwaway mission state so it only computes the final session status and
    never clobbers the active missions already reconciled by
    reconcile_active_missions_from_log (process_line clears active on menu/quit).
    """
    session_tracker.reset()
    scratch = WatcherState()
    ts_session = SessionTracker()
    with open(path, "r", encoding="utf-8", errors="replace") as log_file:
        for line in log_file:
            line = line.rstrip("\r\n")
            if not line:
                continue
            ts = ts_session.resolve_timestamp(line)
            session_tracker.process_line(line, ts, scratch)
    session_tracker.finalize_after_reconcile(scratch)


def is_live_mission_sync_ready(session_tracker: SessionTracker) -> bool:
    """Only push mission lists while the player is in the PU — not at menu or waiting on crash."""
    if session_tracker.pending_status in ("exit_menu", "quit_game", "crash_waiting"):
        return False
    if session_tracker.paused_reason in ("exit_menu", "quit_game"):
        return False
    return True


def publish_live_tracker_state(
    session,
    url: str,
    state: WatcherState,
    session_tracker: SessionTracker,
    ping_ctrl: SessionPingController | None = None,
) -> None:
    """Push game status always; mission snapshot only when log says we're in the PU."""
    status_event = session_tracker.pending_status_event()
    if not is_live_mission_sync_ready(session_tracker):
        if status_event:
            post_game_session_event(session, url, status_event)
        if ping_ctrl:
            ping_ctrl.pause("not in PU")
        print(f"{Colors.CYAN}Live tracker waiting — not in PU yet (no mission sync){Colors.RESET}")
        return

    sync_active_missions_to_server(session, url, state)
    post_game_session_event(session, url, status_event or "game_tracking")
    if ping_ctrl:
        ping_ctrl.resume("in PU")


def post_game_session_event(session, url: str, event_type: str) -> None:
    if not event_type:
        return
    labels = {
        "game_exit_menu": "Quit to menu",
        "game_quit": "Game closed",
        "game_crash": "Game crash detected",
        "game_reconnected": "Back online in PU",
        "game_tracking": "Resumed normal tracking",
    }
    label = labels.get(event_type, event_type)
    try:
        post_dumper_event(session, url, event_type)
        print(f"  [Live] {Colors.CYAN}Game status:{Colors.RESET} {label}")
    except Exception as e:
        print(f"  [Live] {Colors.RED}✗ Game status sync failed ({label}):{Colors.RESET} {e}")


def import_discovered_blueprint(
    product_name: str,
    ts: float,
    state: WatcherState,
    log_name: str,
    session,
    url: str,
    acquired_blueprints: set,
    cache_path: Path,
    *,
    dry_run: bool = False,
    live_prefix: str = "[Live]",
) -> bool:
    """Post a blueprint award if not already cached. Returns True when newly imported."""
    corr = state.correlate_blueprint(ts)
    ts_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts)) if ts else time.strftime("%Y-%m-%d %H:%M:%S")
    if corr:
        print(
            f"  [{ts_str}] [{log_name}] {Colors.MAGENTA}Blueprint received: {Colors.GREEN}{product_name}{Colors.RESET}"
            f"{Colors.MAGENTA} (from {corr.debug_name} on {corr.trigger}){Colors.RESET}"
        )
    else:
        print(
            f"  [{ts_str}] [{log_name}] {Colors.MAGENTA}Blueprint received: {Colors.GREEN}{product_name}{Colors.RESET}"
            f"{Colors.MAGENTA} (no recent mission to correlate){Colors.RESET}"
        )

    contract_def_id = corr.contract_definition_id if corr else None
    cache_key = cache_key_for_input(product_name)
    if cache_key in acquired_blueprints or product_name in acquired_blueprints or is_blueprint_acquired(acquired_blueprints, product_name):
        return False

    if dry_run:
        print(f"  {live_prefix} {Colors.GREEN}★ Would Import (Dry Run):{Colors.RESET} {product_name}")
        return False

    try:
        status, is_duplicate, internal_name, error_msg = post_blueprint_event(
            session, url, product_name, contract_def_id
        )
        if status == 200:
            if is_duplicate:
                print(f"  {live_prefix} {Colors.YELLOW}↻ Already Acquired (Sync):{Colors.RESET} {product_name}")
            else:
                print(f"  {live_prefix} {Colors.GREEN}★ Successfully Imported:{Colors.RESET} {product_name}")
            if internal_name:
                acquired_blueprints.add(internal_name)
                save_cache_file(cache_path, acquired_blueprints)
            return not is_duplicate
        if status == 202:
            print(f"  {live_prefix} {Colors.YELLOW}⚠ Notification sent — mark manually:{Colors.RESET} {product_name}")
            return True
        if error_msg:
            print(f"  {live_prefix} {Colors.RED}✗ {error_msg}{Colors.RESET}")
        else:
            print(f"  {live_prefix} {Colors.RED}✗ Failed to import:{Colors.RESET} {product_name} (HTTP {status})")
    except Exception as e:
        print(f"  {live_prefix} {Colors.RED}✗ Connection Error:{Colors.RESET} {product_name} ({e})")
    return False


def sync_blueprints_from_log(
    path: Path,
    session,
    url: str,
    acquired_blueprints: set,
    cache_path: Path,
    *,
    dry_run: bool = False,
) -> int:
    """Import blueprint awards already written to Game.log before watch mode tails from EOF."""
    imported = 0
    state = WatcherState()
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as log_file:
            for line in log_file:
                line = line.rstrip("\r\n")
                if not line:
                    continue
                ts = parse_log_timestamp(line) or 0.0
                apply_mission_log_line(line, state, ts)
                if m := PATTERN_BLUEPRINT.search(line):
                    product_name = m.group(1).strip()
                    if import_discovered_blueprint(
                        product_name,
                        ts,
                        state,
                        path.name,
                        session,
                        url,
                        acquired_blueprints,
                        cache_path,
                        dry_run=dry_run,
                        live_prefix="[Startup]",
                    ):
                        imported += 1
    except OSError as e:
        print(f"{Colors.YELLOW}⚠ Could not scan {path.name} for blueprints:{Colors.RESET} {e}")
    if imported:
        print(f"{Colors.CYAN}Startup sync: imported {imported} blueprint(s) from current Game.log{Colors.RESET}")
    return imported


def sync_active_missions_to_server(session, url: str, state: WatcherState) -> None:
    missions = [
        {
            "missionGuid": active.guid,
            "contractDefinitionId": active.contract_definition_id or "",
            "debugName": active.debug_name,
        }
        for active in state.active.values()
    ]
    post_dumper_event(session, url, "missions_snapshot", {"missions": missions})
    if missions:
        print(f"{Colors.CYAN}Synced {len(missions)} active mission(s) from Game.log{Colors.RESET}")
    else:
        print(f"{Colors.CYAN}Live missions cleared — none active in Game.log{Colors.RESET}")


def sync_reconnect_missions(session, url: str, path: Path, state: WatcherState, session_tracker: SessionTracker) -> None:
    reconcile_active_missions_from_log(path, state, session_tracker)
    sync_active_missions_to_server(session, url, state)
    post_game_session_event(session, url, "game_reconnected")


def watch_log_file(
    path: Path,
    state: WatcherState,
    acquired_blueprints: set,
    args,
    session=None,
    *,
    keep_up_to_date: bool = True,
):
    print(f"{Colors.CYAN}Watching {path.name} for live events... (Press Ctrl+C to stop){Colors.RESET}")
    ping_stop = threading.Event()
    ping_ctrl = SessionPingController()
    ping_thread = None
    session_tracker = SessionTracker()
    # Grace clock for mission-idle ping pause (reset on PU/mission/BP activity).
    last_mission_activity = time.time()

    def note_mission_activity() -> None:
        nonlocal last_mission_activity
        last_mission_activity = time.time()

    def maybe_idle_pause_pings() -> None:
        if not session or args.dry_run:
            return
        if not is_live_mission_sync_ready(session_tracker):
            return
        if ping_ctrl.is_paused():
            return
        if state.active:
            return
        if (time.time() - last_mission_activity) < MISSION_IDLE_PAUSE_SEC:
            return
        ping_ctrl.pause("no mission activity 1h")
        print(
            f"  [Live] {Colors.DIM}Session ping paused "
            f"(no mission/BP activity for 1h; still watching Game.log){Colors.RESET}"
        )

    if session and not args.dry_run:
        ping_thread = threading.Thread(
            target=start_session_ping_loop,
            args=(session, args.url, ping_stop, ping_ctrl),
            daemon=True,
        )
        ping_thread.start()

    fh = None
    last_inode = None
    last_size = 0
    buffer = bytearray()
    first_open = True
    cache_path = _app_dir() / ".dumper_cache.json"

    def check_update_from_ping() -> None:
        err = ping_ctrl.take_update_required()
        if err:
            handle_update_required(err, keep_up_to_date=keep_up_to_date)

    try:
        while True:
            check_update_from_ping()
            maybe_idle_pause_pings()
            try:
                st = path.stat()
            except FileNotFoundError:
                if fh:
                    fh.close()
                    fh = None
                    last_inode = None
                    buffer.clear()
                    print(f"{Colors.YELLOW}Game.log not found, waiting for it to appear...{Colors.RESET}")
                ping_ctrl.pause("Game.log missing")
                time.sleep(1.0)
                continue
            except OSError:
                time.sleep(1.0)
                continue

            rotated = (
                fh is None
                or (last_inode is not None and st.st_ino and st.st_ino != last_inode)
                or st.st_size < last_size
            )

            if rotated:
                if fh:
                    print(f"{Colors.YELLOW}Log rotation detected — game closed, resetting mission state{Colors.RESET}")
                    session_tracker.on_log_rotation(state)
                    if session and not args.dry_run:
                        try:
                            post_game_session_event(session, args.url, "game_quit")
                        except DumperUpdateRequired as e:
                            handle_update_required(e, keep_up_to_date=keep_up_to_date)
                        except Exception:
                            pass
                        ping_ctrl.pause("log rotation / game closed")
                    fh.close()
                    state.guid_map.clear()
                    state.recent_lifecycle.clear()
                try:
                    reconcile_active_missions_from_log(path, state)
                    seed_session_tracker_from_log(path, session_tracker, state)
                    ensure_awaiting_pu(session_tracker)
                    if session and not args.dry_run:
                        try:
                            sync_blueprints_from_log(
                                path, session, args.url, acquired_blueprints, cache_path
                            )
                            post_dumper_event(session, args.url, "session_start")
                            publish_live_tracker_state(
                                session, args.url, state, session_tracker, ping_ctrl
                            )
                            if is_live_mission_sync_ready(session_tracker):
                                note_mission_activity()
                        except DumperUpdateRequired as e:
                            handle_update_required(e, keep_up_to_date=keep_up_to_date)
                        except Exception as e:
                            print(f"{Colors.YELLOW}⚠ Could not sync live tracker:{Colors.RESET} {e}")
                except OSError as e:
                    print(f"{Colors.YELLOW}⚠ Could not reconcile active missions:{Colors.RESET} {e}")
                try:
                    fh = open(path, "rb")
                except OSError:
                    fh = None
                    time.sleep(1.0)
                    continue
                fh.seek(0, os.SEEK_END)
                last_inode = st.st_ino or None
                last_size = st.st_size
                buffer.clear()
                if first_open:
                    print("Tailing Game.log for new events...")
                    first_open = False
                else:
                    print("Opened new log session...")

            if fh and session and not args.dry_run:
                expired = session_tracker.expire_stale_crash_if_needed(state)
                if expired:
                    try:
                        post_game_session_event(session, args.url, expired)
                    except DumperUpdateRequired as e:
                        handle_update_required(e, keep_up_to_date=keep_up_to_date)
                    except Exception:
                        pass
                    if expired in ("game_quit", "game_exit_menu", "game_tracking"):
                        if expired == "game_tracking":
                            ping_ctrl.resume("crash wait ended")
                            note_mission_activity()
                        else:
                            ping_ctrl.pause(expired)

            if not fh:
                time.sleep(0.5)
                continue

            try:
                chunk = fh.read()
            except OSError:
                time.sleep(1.0)
                continue

            if chunk:
                # Do NOT resume session_ping on raw log bytes — menu noise would keep
                # pings alive after exit/AFK. Resume only on PU/reconnect/mission below.
                buffer.extend(chunk)
                nl = buffer.rfind(b"\n")
                if nl >= 0:
                    block = bytes(buffer[: nl + 1])
                    del buffer[: nl + 1]
                    for raw in block.splitlines():
                        if not raw:
                            continue
                        line = raw.decode("utf-8", errors="replace")
                        ts = session_tracker.resolve_timestamp(line)
                        ts_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
                        was_paused = bool(session_tracker.paused_reason or session_tracker.crash_at is not None)

                        try:
                            game_event = session_tracker.process_line(line, ts, state)
                            if game_event == "game_reconnected" and session and not args.dry_run:
                                try:
                                    sync_reconnect_missions(session, args.url, path, state, session_tracker)
                                    ping_ctrl.resume("reconnected")
                                    note_mission_activity()
                                except Exception as e:
                                    print(f"  [Live] {Colors.YELLOW}⚠ Could not resync missions after reconnect:{Colors.RESET} {e}")
                                    game_event = ""
                            elif game_event in ("game_exit_menu", "game_quit") and session and not args.dry_run:
                                try:
                                    post_game_session_event(session, args.url, game_event)
                                except Exception as e:
                                    print(f"  [Live] {Colors.RED}✗ Game status sync failed:{Colors.RESET} {e}")
                                ping_ctrl.pause(game_event)
                            elif game_event and session and not args.dry_run:
                                try:
                                    post_game_session_event(session, args.url, game_event)
                                except Exception as e:
                                    print(f"  [Live] {Colors.RED}✗ Game status sync failed:{Colors.RESET} {e}")

                            active = apply_mission_log_line(line, state, ts)
                            mission_end = PATTERN_END_MISSION.search(line)
                            blueprint_hit = PATTERN_BLUEPRINT.search(line)

                            if active:
                                session_tracker.on_mission_accepted()
                                print(f"  [{ts_str}] [{path.name}] {Colors.GREEN}Mission started: {active.debug_name} ({active.guid}){Colors.RESET}")
                                if session and not args.dry_run and is_live_mission_sync_ready(session_tracker):
                                    try:
                                        post_dumper_event(session, args.url, "mission_started", {
                                            "missionGuid": active.guid,
                                            "contractDefinitionId": active.contract_definition_id or "",
                                            "debugName": active.debug_name,
                                        })
                                        ping_ctrl.resume("mission activity")
                                        note_mission_activity()
                                    except Exception as e:
                                        print(f"  [Live] {Colors.RED}✗ Mission sync failed:{Colors.RESET} {e}")

                            elif mission_end:
                                guid, completion, reason = mission_end.group(1), mission_end.group(2), mission_end.group(3)
                                ended = state.record_end(guid, completion, ts)
                                entry = state.guid_map.get(guid)
                                debug_name = ended.debug_name if ended else (entry.debug_name if entry else "Unknown")

                                if completion == "Complete":
                                    print(f"  [{ts_str}] [{path.name}] {Colors.CYAN}Mission complete: {debug_name} ({guid}) [{reason}]{Colors.RESET}")
                                elif completion == "Abandon":
                                    print(f"  [{ts_str}] [{path.name}] {Colors.RED}Mission abandoned: {debug_name} ({guid}) [{reason}]{Colors.RESET}")
                                elif completion == "Fail":
                                    print(f"  [{ts_str}] [{path.name}] {Colors.YELLOW}Mission failed: {debug_name} ({guid}) [{reason}]{Colors.RESET}")
                                else:
                                    print(f"  [{ts_str}] [{path.name}] {Colors.YELLOW}Mission ended ({completion}): {debug_name} ({guid}) [{reason}]{Colors.RESET}")

                                if session and not args.dry_run and is_live_mission_sync_ready(session_tracker):
                                    try:
                                        post_dumper_event(session, args.url, "mission_ended", {
                                            "missionGuid": guid,
                                            "completion": completion,
                                        })
                                    except Exception as e:
                                        print(f"  [Live] {Colors.RED}✗ Mission end sync failed:{Colors.RESET} {e}")
                                note_mission_activity()

                            elif blueprint_hit:
                                import_discovered_blueprint(
                                    blueprint_hit.group(1).strip(),
                                    ts,
                                    state,
                                    path.name,
                                    session,
                                    args.url,
                                    acquired_blueprints,
                                    cache_path,
                                    dry_run=args.dry_run,
                                )
                                note_mission_activity()
                                if ping_ctrl.is_paused() and is_live_mission_sync_ready(session_tracker):
                                    ping_ctrl.resume("blueprint activity")

                            if (
                                was_paused
                                and not game_event
                                and session
                                and not args.dry_run
                                and (active or mission_end or blueprint_hit)
                            ):
                                session_tracker.mark_back_in_pu(state, ts)
                                try:
                                    sync_reconnect_missions(session, args.url, path, state, session_tracker)
                                    ping_ctrl.resume("back in PU")
                                    note_mission_activity()
                                except Exception as e:
                                    print(f"  [Live] {Colors.YELLOW}⚠ Could not resync after PU activity:{Colors.RESET} {e}")
                        except DumperUpdateRequired as e:
                            handle_update_required(e, keep_up_to_date=keep_up_to_date)
                last_size = st.st_size
            else:
                time.sleep(0.5)
    except KeyboardInterrupt:
        print(f"\n{Colors.CYAN}Stopped watching.{Colors.RESET}")
    except DumperUpdateRequired as e:
        handle_update_required(e, keep_up_to_date=keep_up_to_date)
    finally:
        ping_stop.set()
        if ping_thread:
            ping_thread.join(timeout=1.0)
        if session and not args.dry_run:
            try:
                post_dumper_event(session, args.url, "session_end")
            except DumperUpdateRequired:
                pass
            except Exception as e:
                print(f"{Colors.YELLOW}⚠ Failed to notify session end:{Colors.RESET} {e}")
        if fh:
            fh.close()

def is_log_version_allowed(path: Path, min_version: str) -> bool:
    if not min_version:
        return True
    try:
        parts = re.search(r"([0-9]+)\.([0-9]+)", min_version)
        if not parts:
            return True
        min_major = int(parts.group(1))
        min_minor = int(parts.group(2))
    except Exception:
        return True

    if not path.is_file():
        return False

    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f):
                if i > 150:
                    break
                line_lower = line.lower()

                # 1. Check Product Version:
                idx = line_lower.find("product version:")
                if idx != -1:
                    matches = re.search(r"([0-9]+)\.([0-9]+)", line[idx+16:])
                    if matches:
                        try:
                            major = int(matches.group(1))
                            minor = int(matches.group(2))
                            if major > min_major or (major == min_major and minor >= min_minor):
                                return True
                            return False
                        except Exception:
                            pass

                # 2. Check Branch:
                idx_branch = line_lower.find("branch:")
                if idx_branch != -1:
                    matches = re.search(r"([0-9]+)\.([0-9]+)", line[idx_branch+7:])
                    if matches:
                        try:
                            major = int(matches.group(1))
                            minor = int(matches.group(2))
                            if major > min_major or (major == min_major and minor >= min_minor):
                                return True
                            return False
                        except Exception:
                            pass
    except Exception:
        pass
    return True

def parse_local_localization(channel_dir: Path) -> dict:
    local_map = {}
    loc_dir = channel_dir / "data" / "Localization"
    if not loc_dir.exists() or not loc_dir.is_dir():
        return local_map
    
    for path in loc_dir.rglob("global.ini"):
        if not path.is_file():
            continue
        try:
            with open(path, "r", encoding="utf-8-sig", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith(";") or line.startswith("#"):
                        continue
                    parts = line.split("=", 1)
                    if len(parts) != 2:
                        continue
                    key, val = parts[0].strip(), parts[1].strip()
                    val = val.strip("'\"")
                    if not key or not val:
                        continue
                    
                    internal_name = ""
                    if key.startswith("item_Name_"):
                        internal_name = key[10:]
                    elif key.startswith("item_Name"):
                        internal_name = key[9:]
                    elif key.endswith("_Name"):
                        internal_name = key[:-5]
                    
                    if internal_name:
                        internal_name = _canonical_internal_key(internal_name)
                        val_lower = val.lower()
                        if val_lower not in local_map:
                            local_map[val_lower] = []
                        if internal_name not in local_map[val_lower]:
                            local_map[val_lower].append(internal_name)
        except Exception:
            pass
    return local_map

def main():
    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
        except Exception:
            disable_colors()
    if not sys.stdout.isatty():
        disable_colors()

    parser = argparse.ArgumentParser(
        description="Submit historical log-watcher blueprint exports to your account."
    )
    parser.add_argument(
        "file_path",
        type=Path,
        nargs="?",
        default=None,
        help="Optional: Path to the JSON file generated by 'watcher.py import'. If omitted, the script will scan Star Citizen log files directly."
    )
    parser.add_argument(
        "--url",
        help="Override Supabase webhook URL (optional; built-in default is used)."
    )
    parser.add_argument(
        "--key",
        help="Your secret API key. If omitted, the script will read the LOG_WATCHER_API_KEY environment variable."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run: scan and log blueprints locally without making network calls or requiring an API key."
    )
    parser.add_argument(
        "--watch", "-w",
        action="store_true",
        default=None,
        help="Watch mode: trails a Game.log file in real-time (default: on)."
    )
    parser.add_argument(
        "--no-watch",
        action="store_true",
        help="Disable watch mode (batch import only)."
    )
    parser.add_argument(
        "--log-dir",
        type=Path,
        help="Directly scan a specific directory for log files instead of auto-detecting Star Citizen."
    )
    parser.add_argument(
        "--full-history-import",
        action="store_true",
        help=(
            "One-time catch-up: scan ALL log files (including Game.log and older patches; "
            "no version filter), import every blueprint award found, then disable itself."
        ),
    )
    parser.add_argument(
        "--configure", "-c",
        action="store_true",
        help="Force running the configuration wizard."
    )

    args = parser.parse_args()

    # Load configuration from .env file
    env_path = _app_dir() / ".env"
    env_vars = load_env_file(env_path)

    # Resolve watch mode: default on; --no-watch or WATCH_MODE=false disables
    if args.no_watch:
        args.watch = False
    elif args.watch is True:
        args.watch = True
    elif env_vars.get("WATCH_MODE") == "false":
        args.watch = False
    elif env_vars.get("WATCH_MODE") == "true":
        args.watch = True
    else:
        args.watch = True

    is_interactive = args.configure or (sys.stdout.isatty() and not args.dry_run and (
        not args.key and not os.getenv("LOG_WATCHER_API_KEY") and not env_vars.get("LOG_WATCHER_API_KEY")
    ))

    if is_interactive:
        print(f"{Colors.CYAN}===================================================={Colors.RESET}")
        print(f"{Colors.CYAN}             BP Dumper Configuration Wizard{Colors.RESET}")
        print(f"{Colors.CYAN}===================================================={Colors.RESET}")
        print()
        print(f"{Colors.DIM}Source: github.com/Sinedrone-Sentinel/dumpers_repo (Python watcher){Colors.RESET}")
        print(f"{Colors.DIM}Trust:  OpenSSF Scorecard + site Trust links under Dumper Apps{Colors.RESET}")
        print(f"{Colors.DIM}Tip:    Leave the path blank — BP Dumper searches for your LIVE install.{Colors.RESET}")
        print(f"{Colors.DIM}        Or paste your LIVE folder path (the folder that contains Game.log).{Colors.RESET}")
        print()

        # 1. Prompt file path / directory
        default_path = env_vars.get("LOG_PATH", "")
        path_prompt = "Enter path to LIVE folder / Game.log (Leave empty to auto-detect)"
        if default_path:
            path_prompt += f" [{default_path}]"
        path_prompt += ": "
        
        try:
            user_path = input(path_prompt).strip().strip('"').strip("'")
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)
            
        if not user_path and default_path:
            user_path = default_path
        
        if not user_path:
            print(f"{Colors.DIM}Auto-detecting Star Citizen installations...{Colors.RESET}")
            installs = detect_sc_installs()
            if installs:
                chosen_channel = "LIVE" if "LIVE" in installs else list(installs.keys())[0]
                detected_dir = installs[chosen_channel]
                print(f"{Colors.GREEN}Detected channel {chosen_channel} at: {detected_dir}{Colors.RESET}")
                user_path = str(detected_dir)
            else:
                fallback = Path(DEFAULT_WIN_PATH)
                live_dir = fallback / "LIVE" if fallback.is_dir() else None
                if live_dir is not None and live_dir.is_dir():
                    print(f"{Colors.GREEN}Detected default fallback at: {live_dir}{Colors.RESET}")
                    user_path = str(live_dir)
                else:
                    user_path = _prompt_live_path_until_valid("")
        elif not Path(user_path).exists():
            print(f"{Colors.RED}Path not found: {user_path}{Colors.RESET}")
            user_path = _prompt_live_path_until_valid("")

        if user_path:
            args.file_path = Path(user_path)

        # 2. Prompt Dry Run
        try:
            user_dry_run = input("Dry run only? (Y/N, Enter = N): ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)
            
        if user_dry_run == 'y':
            args.dry_run = True

        # 3. Prompt Watch Mode
        args.watch = True
        try:
            user_watch = input("Watch mode (trail log file in real-time)? (Y/N, Enter = Y): ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)
            
        if user_watch == 'n':
            args.watch = False



        # Prompt Key (only if not dry run)
        if not args.dry_run:
            default_key = env_vars.get("LOG_WATCHER_API_KEY", "")
            key_prompt = "Enter your BP Dumper API key from Settings (e.g. dr_...)"
            if default_key:
                masked_key = f"{default_key[:6]}...{default_key[-4:]}" if len(default_key) > 10 else default_key
                key_prompt += f" [{masked_key}]"
            key_prompt += ": "
            
            try:
                user_key = input(key_prompt).strip().strip('"').strip("'")
            except (KeyboardInterrupt, EOFError):
                print("\nAborted.")
                sys.exit(0)
                
            if not user_key and default_key:
                user_key = default_key
            args.key = user_key

        try:
            user_import_old = input(
                f"Import recent backup logs on first run ({MIN_GAME_VERSION}.x only)? (Y/N, Enter = Y): "
            ).strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)

        import_old_logs = "true"
        if user_import_old == "n":
            import_old_logs = "false"

        try:
            print()
            print(
                f"{Colors.YELLOW}Full history import{Colors.RESET} scans EVERY log file "
                "(all patches, including the current Game.log). No version filter. "
                "Use this once to catch up BPs from large logbackups. It can take a long time."
            )
            user_full_history = input(
                "Run one-time FULL history import now? (Y/N, Enter = Y): "
            ).strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)

        if user_full_history == "" or user_full_history == "y":
            full_history_import = "true"
        else:
            full_history_import = "false"

        print()

        # Save variables to .env file immediately
        resolved_url = args.url or env_vars.get("SUPABASE_WEBHOOK_URL") or DEFAULT_WEBHOOK_URL
        new_env = {
            "LOG_PATH": str(args.file_path) if args.file_path else "",
            "SUPABASE_WEBHOOK_URL": resolved_url if not args.dry_run else "",
            "LOG_WATCHER_API_KEY": args.key if args.key else "",
            "IMPORT_OLD_LOGS": import_old_logs,
            "FULL_HISTORY_IMPORT": full_history_import,
            "WATCH_MODE": "true" if args.watch else "false",
            "KEEP_APP_UP_TO_DATE": "false",
        }
        env_vars.update(new_env)
        save_env_file(env_path, env_vars)

    # No path yet — auto-detect or keep asking (Store / odd install paths).
    if not args.file_path and not args.log_dir:
        if env_vars.get("LOG_PATH"):
            args.file_path = Path(env_vars["LOG_PATH"])
        else:
            installs = detect_sc_installs()
            fallback_live = Path(DEFAULT_WIN_PATH) / "LIVE"
            if installs:
                chosen = "LIVE" if "LIVE" in installs else list(installs.keys())[0]
                args.file_path = installs[chosen]
            elif fallback_live.is_dir():
                args.file_path = fallback_live
            elif sys.stdin.isatty():
                args.file_path = Path(_prompt_live_path_until_valid(""))
                env_vars["LOG_PATH"] = str(args.file_path)
                save_env_file(env_path, env_vars)
            else:
                _exit_star_citizen_not_detected()

    # Resolve URL & API Key (checks CLI args -> ENV variables -> .env file -> built-in default)
    url = args.url or os.getenv("SUPABASE_WEBHOOK_URL") or env_vars.get("SUPABASE_WEBHOOK_URL") or DEFAULT_WEBHOOK_URL
    api_key = None
    if not args.dry_run:
        api_key = args.key or os.getenv("LOG_WATCHER_API_KEY") or env_vars.get("LOG_WATCHER_API_KEY")
        if not api_key:
            print(f"{Colors.RED}Error: API key must be provided via --key, LOG_WATCHER_API_KEY environment variable, or configured in .env file.{Colors.RESET}", file=sys.stderr)
            sys.exit(1)

    # Update script args.url with resolved URL for reference
    args.url = url
    keep_up_to_date = False
    if env_path.is_file() and env_vars.get("KEEP_APP_UP_TO_DATE") != "false":
        env_vars["KEEP_APP_UP_TO_DATE"] = "false"
        save_env_file(env_path, env_vars)

    cache_path = _app_dir() / ".dumper_cache.json"
    acquired_blueprints = load_cache_file(cache_path)

    session = None
    if not args.dry_run:
        try:
            import requests
        except ImportError:
            print("Error: The 'requests' library is not installed. Run 'pip install -r requirements.txt' to import blueprints to your account.", file=sys.stderr)
            sys.exit(1)

        session = requests.Session()
        session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-Dumper-Version": DUMPER_VERSION,
        })

        print(f"{Colors.DIM}Synchronizing blueprints list from server (dumper {DUMPER_VERSION})...{Colors.RESET}")
        try:
            res = session.get(args.url, timeout=15)
            raise_if_update_required(res)
            if res.status_code == 200:
                response_json = _response_json(res)
                if response_json.get("success"):
                    server_bps = response_json.get("blueprints", [])
                    acquired_blueprints.update(server_bps)
                    save_cache_file(cache_path, acquired_blueprints)
                    print(f"Synced {len(server_bps)} blueprints from account.")

                    latest_ver = str(response_json.get("latestDumperVersion") or "")
                    if latest_ver and _is_newer_version(latest_ver, DUMPER_VERSION):
                        # Soft path if Edge has not flipped hard gate yet — still force update policy.
                        handle_update_required(
                            DumperUpdateRequired(
                                latest_ver,
                                str(response_json.get("downloadUrl") or DEFAULT_DOWNLOAD_URL),
                            ),
                            keep_up_to_date=keep_up_to_date,
                        )
            else:
                print(f"{Colors.RED}Error: Server sync returned HTTP {res.status_code}. Cannot continue.{Colors.RESET}")
                sys.exit(1)
        except DumperUpdateRequired as e:
            handle_update_required(e, keep_up_to_date=keep_up_to_date)
        except Exception as e:
            print(f"{Colors.RED}Error: Could not sync with server ({e}).{Colors.RESET}")
            sys.exit(1)

    # Optional one-shot log imports before watch mode
    run_full_history = bool(getattr(args, "full_history_import", False)) or (
        env_vars.get("FULL_HISTORY_IMPORT") == "true"
    )
    run_recent_history = env_vars.get("IMPORT_OLD_LOGS") == "true"
    did_batch_import = False

    if run_full_history or run_recent_history:
        channel_dir = resolve_sc_channel_dir(args, env_vars)
        log_dirs: list[Path] = []
        if args.log_dir and args.log_dir.is_dir():
            log_dirs = [args.log_dir]
        elif channel_dir:
            log_dirs = [channel_dir, channel_dir / "logbackups"]

        if run_full_history:
            did_batch_import = True
            run_log_folder_blueprint_import(
                log_dirs,
                session=session,
                url=url,
                acquired_blueprints=acquired_blueprints,
                cache_path=cache_path,
                dry_run=args.dry_run,
                include_game_log=True,
                skip_version_check=True,
                banner=(
                    "[Full History] Scanning ALL .log files (version filter OFF) — "
                    "one-time catch-up for your account..."
                ),
            )
            env_vars["FULL_HISTORY_IMPORT"] = "false"
            # Full history already covers recent backups; don't run the limited pass too.
            env_vars["IMPORT_OLD_LOGS"] = "false"
            save_env_file(env_path, env_vars)
            print(
                f"{Colors.GREEN}[Full History] Import complete. "
                f"FULL_HISTORY_IMPORT disabled for future launches.{Colors.RESET}\n"
            )
        elif run_recent_history:
            did_batch_import = True
            run_log_folder_blueprint_import(
                log_dirs,
                session=session,
                url=url,
                acquired_blueprints=acquired_blueprints,
                cache_path=cache_path,
                dry_run=args.dry_run,
                include_game_log=False,
                skip_version_check=False,
                banner=(
                    f"[First Run] Scanning backup logs ({MIN_GAME_VERSION}.x only)..."
                ),
            )
            env_vars["IMPORT_OLD_LOGS"] = "false"
            save_env_file(env_path, env_vars)
            print(
                f"{Colors.GREEN}[First Run] Recent-log import complete. "
                f"Disabling future auto-imports.{Colors.RESET}\n"
            )

    # Watch Mode execution (after optional historical import)
    if args.watch:
        if did_batch_import:
            print(f"{Colors.CYAN}[Watch Mode] Batch import finished. Tailing Game.log for new blueprints...{Colors.RESET}\n")
        watch_file = None
        if args.file_path:
            if args.file_path.is_file():
                watch_file = args.file_path
            elif args.file_path.is_dir():
                watch_file = args.file_path / "Game.log"
        else:
            if args.log_dir:
                watch_file = args.log_dir / "Game.log"
            elif env_vars.get("LOG_PATH"):
                p = Path(env_vars["LOG_PATH"])
                watch_file = p / "Game.log" if p.is_dir() else p
            else:
                installs = detect_sc_installs()
                if installs:
                    chosen_channel = "LIVE" if "LIVE" in installs else list(installs.keys())[0]
                    watch_file = installs[chosen_channel] / "Game.log"
                else:
                    fallback = Path(DEFAULT_WIN_PATH)
                    live_dir = fallback / "LIVE" if fallback.is_dir() else None
                    if live_dir is not None and live_dir.is_dir():
                        watch_file = live_dir / "Game.log"

        if not watch_file:
            _exit_star_citizen_not_detected()

        # Load local translations if any
        channel_dir = watch_file.parent
        local_loc_map = parse_local_localization(channel_dir)
        if local_loc_map:
            register_custom_translations(local_loc_map)
            print(f"{Colors.GREEN}Loaded {len(local_loc_map)} custom translations from local global.ini (StarStrings/localization mod active){Colors.RESET}")

        state = WatcherState()
        watch_log_file(
            watch_file,
            state,
            acquired_blueprints,
            args,
            session,
            keep_up_to_date=keep_up_to_date,
        )
        return

    unique_blueprints: list[tuple[str, str | None]] = []
    source_name = ""

    # Mode 1: A path is provided
    if args.file_path:
        if args.file_path.is_file():
            if args.file_path.suffix == ".json":
                # JSON Export File
                try:
                    with open(args.file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    blueprints_list = data.get("blueprints", [])
                    names = [
                        bp.get("productName") for bp in blueprints_list if bp.get("productName")
                    ]
                    unique_blueprints = coalesce_discovered_blueprints(
                        [(name, None) for name in names]
                    )
                    source_name = args.file_path.name
                except Exception as e:
                    print(f"{Colors.RED}Error parsing JSON: {e}{Colors.RESET}", file=sys.stderr)
                    sys.exit(1)
            else:
                # Direct single log file parsing (e.g., Game.log) — no recent-import version filter
                print(f"Scanning single log file: {args.file_path.name}...")
                channel_dir = args.file_path.parent
                local_loc_map = parse_local_localization(channel_dir)
                if local_loc_map:
                    register_custom_translations(local_loc_map)
                    print(f"{Colors.GREEN}Loaded {len(local_loc_map)} custom translations from local global.ini (StarStrings/localization mod active){Colors.RESET}")

                all_bps = parse_blueprints_from_log(args.file_path)
                unique_blueprints = coalesce_discovered_blueprints(all_bps)
                source_name = args.file_path.name
        elif args.file_path.is_dir():
            # Direct directory scan (e.g. logbackups folder) — backlog read, no version filter
            log_files = collect_log_files_for_import([args.file_path], include_game_log=True)
            if not log_files:
                print(f"{Colors.RED}Error: No log files found in directory: {args.file_path}{Colors.RESET}", file=sys.stderr)
                sys.exit(1)

            # Merge local translations if any
            local_loc_map = parse_local_localization(args.file_path)
            if not local_loc_map:
                local_loc_map = parse_local_localization(args.file_path.parent)
            if local_loc_map:
                register_custom_translations(local_loc_map)
                print(f"{Colors.GREEN}Loaded {len(local_loc_map)} custom translations from local global.ini (StarStrings/localization mod active){Colors.RESET}")

            print(f"Scanning {len(log_files)} log file(s) in {args.file_path.name} (Multithreaded, version filter OFF)...")
            all_bps: list[tuple[str, str | None]] = []
            work_items = [(i, len(log_files), path, True) for i, path in enumerate(log_files, 1)]
            with concurrent.futures.ThreadPoolExecutor() as executor:
                for res in executor.map(process_log_file, work_items):
                    all_bps.extend(res)
            unique_blueprints = coalesce_discovered_blueprints(all_bps)
            source_name = f"direct directory scan ({len(log_files)} file(s))"
        else:
            print(f"{Colors.RED}Error: Path not found: {args.file_path}{Colors.RESET}", file=sys.stderr)
            sys.exit(1)

    # Mode 2: Auto-detect installs (no path provided, or --log-dir was passed)
    else:
        log_dirs = []
        if args.log_dir:
            log_dirs = [args.log_dir]
        else:
            # Auto-detect installs
            print(f"{Colors.DIM}Scanning local system for Star Citizen installations...{Colors.RESET}")
            installs = detect_sc_installs()
            if installs:
                print(f"Detected channel installations:")
                for channel, install_path in installs.items():
                    print(f"  - {channel}: {install_path}")
                # Prefer LIVE, fall back to first one found
                chosen_channel = "LIVE" if "LIVE" in installs else list(installs.keys())[0]
                channel_dir = installs[chosen_channel]
                print(f"Using channel: {Colors.CYAN}{chosen_channel}{Colors.RESET} ({channel_dir})")
                log_dirs = [channel_dir, channel_dir / "logbackups"]
            else:
                # Standard fallback locations
                fallback = Path(DEFAULT_WIN_PATH)
                if fallback.is_dir():
                    # scan LIVE by default
                    live_dir = fallback / "LIVE"
                    if live_dir.is_dir():
                        log_dirs = [live_dir, live_dir / "logbackups"]

        if not log_dirs or not any(d.is_dir() for d in log_dirs):
            _exit_star_citizen_not_detected()

        # Collect log files (backlog read — no recent-import version filter)
        log_files = collect_log_files_for_import(log_dirs, include_game_log=True)
        local_loaded = False
        for d in log_dirs:
            if d.is_dir() and not local_loaded:
                local_loc_map = parse_local_localization(d)
                if not local_loc_map:
                    local_loc_map = parse_local_localization(d.parent)
                if local_loc_map:
                    register_custom_translations(local_loc_map)
                    print(f"{Colors.GREEN}Loaded {len(local_loc_map)} custom translations from local global.ini (StarStrings/localization mod active){Colors.RESET}")
                    local_loaded = True
        
        if not log_files:
            print(f"{Colors.RED}Error: No log files found in detected directories: {[str(d) for d in log_dirs]}{Colors.RESET}", file=sys.stderr)
            sys.exit(1)

        print(f"Scanning {len(log_files)} log file(s) (Multithreaded, version filter OFF)...")
        all_bps: list[tuple[str, str | None]] = []
        work_items = [(i, len(log_files), path, True) for i, path in enumerate(log_files, 1)]
        with concurrent.futures.ThreadPoolExecutor() as executor:
            for res in executor.map(process_log_file, work_items):
                all_bps.extend(res)
        
        unique_blueprints = coalesce_discovered_blueprints(all_bps)
        source_name = f"direct log scan ({len(log_files)} file(s))"

    if not unique_blueprints:
        print(f"{Colors.YELLOW}No blueprints discovered.{Colors.RESET}")
        return

    # Load local dumper cache
    cache_path = _app_dir() / ".dumper_cache.json"
    acquired_blueprints = load_cache_file(cache_path)

    # If running in non-dry-run mode, synchronize with the server
    if not args.dry_run:
        try:
            import requests
        except ImportError:
            print("Error: The 'requests' library is not installed. Run 'pip install -r requirements.txt' to import blueprints to your account.", file=sys.stderr)
            sys.exit(1)

        session = requests.Session()
        session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        })

        # Sync from database (Option 2: Webhook GET Sync)
        print(f"{Colors.DIM}Synchronizing blueprints list from server...{Colors.RESET}")
        try:
            res = session.get(args.url, timeout=15)
            if res.status_code == 200:
                response_json = res.json()
                if response_json.get("success"):
                    server_bps = response_json.get("blueprints", [])
                    acquired_blueprints.update(server_bps)
                    save_cache_file(cache_path, acquired_blueprints)
                    print(f"Synced {len(server_bps)} blueprints from account.")
            else:
                print(f"{Colors.YELLOW}Warning: Server sync returned HTTP {res.status_code}. Using local cache only.{Colors.RESET}")
        except Exception as e:
            print(f"{Colors.YELLOW}Warning: Could not sync blueprints from server ({e}). Using local cache only.{Colors.RESET}")

    # Option 1: Local Cache Filter
    to_import = [
        (bp, cid)
        for bp, cid in unique_blueprints
        if not is_blueprint_acquired(acquired_blueprints, bp)
    ]
    skipped_count = len(unique_blueprints) - len(to_import)

    if skipped_count > 0:
        print(f"{Colors.DIM}Skipped {skipped_count} blueprint(s) already acquired (cached or server-synced).{Colors.RESET}")

    if not to_import:
        print(f"{Colors.GREEN}All discovered blueprints are already acquired! Nothing to import.{Colors.RESET}")
        return

    print(f"{Colors.CYAN}Starting import of {len(to_import)} unique blueprint(s) from {source_name}...{Colors.RESET}")
    print()

    success_count = 0
    dupe_count = 0
    fail_count = 0

    if args.dry_run:
        for idx, (bp_id, contract_id) in enumerate(to_import, 1):
            success_count += 1
            resolved = resolve_blueprint_input(bp_id, contract_id)
            label = bp_id
            if resolved.get("ok"):
                label = f"{resolved['blueprint_name']} → {resolved['internal_name']}"
            elif resolved.get("error") == "ambiguous_blueprint":
                label = f"{bp_id} (ambiguous — would notify)"
            print(f"  [{idx}/{len(to_import)}] {Colors.GREEN}★ Would Import:{Colors.RESET} {label}")
    else:
        for idx, (bp_id, contract_id) in enumerate(to_import, 1):
            try:
                status, is_duplicate, internal_name, error_msg = post_blueprint_event(
                    session, args.url, bp_id, contract_id
                )
                if status == 200:
                    if is_duplicate:
                        dupe_count += 1
                        print(f"  [{idx}/{len(to_import)}] {Colors.YELLOW}↻ Already Acquired:{Colors.RESET} {bp_id}")
                    else:
                        success_count += 1
                        print(f"  [{idx}/{len(to_import)}] {Colors.GREEN}★ Successfully Imported:{Colors.RESET} {bp_id}")
                    if internal_name:
                        acquired_blueprints.add(internal_name)
                        save_cache_file(cache_path, acquired_blueprints)
                elif status == 202:
                    success_count += 1
                    print(f"  [{idx}/{len(to_import)}] {Colors.YELLOW}⚠ Notification sent — mark manually:{Colors.RESET} {bp_id}")
                elif error_msg:
                    fail_count += 1
                    print(f"  [{idx}/{len(to_import)}] {Colors.RED}✗ {error_msg}{Colors.RESET}")
                else:
                    fail_count += 1
                    print(f"  [{idx}/{len(to_import)}] {Colors.RED}✗ Failed:{Colors.RESET} {bp_id} (HTTP {status})")
            except requests.RequestException as e:
                fail_count += 1
                print(f"  [{idx}/{len(to_import)}] {Colors.RED}✗ Connection Error:{Colors.RESET} {bp_id} (Reason: {e})")

    print()
    print(f"{Colors.CYAN}Import Finished Summary:{Colors.RESET}")
    if args.dry_run:
        print(f"  {Colors.GREEN}★ Would Import: {success_count}{Colors.RESET}")
    else:
        print(f"  {Colors.GREEN}★ Imported:     {success_count}{Colors.RESET}")
        print(f"  {Colors.YELLOW}↻ Duplicates:   {dupe_count}{Colors.RESET}")
        if fail_count > 0:
            print(f"  {Colors.RED}✗ Failed:       {fail_count}{Colors.RESET}")
        else:
            print(f"  ✗ Failed:       0")

if __name__ == "__main__":
    main()
