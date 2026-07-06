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
import sys
import threading
import time
from pathlib import Path
from typing import Optional, Any

_LOOKUP_PATH = Path(__file__).resolve().parent / "lookup.json"
_cached: dict[str, Any] | None = None

def _load_lookup() -> dict[str, Any]:
    global _cached
    if _cached is None:
        with _LOOKUP_PATH.open(encoding="utf-8") as f:
            _cached = json.load(f)
    return _cached

def _normalize_display_key(value: str) -> str:
    val = value.strip().lower()
    val = re.sub(r"^(?:civ|ind|mil|ste|com)/[0-9]/[a-d]\s+", "", val, flags=re.I)
    val = re.sub(r"\s+'[^']+'\s*$", "", val)
    return val.strip()

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
    body = {}
    try:
        body = res.json()
    except Exception:
        pass
    internal_name = body.get("blueprint") or (local["internal_name"] if local.get("ok") else None)
    return res.status_code, body.get("duplicate", False), internal_name


def post_dumper_event(session, url: str, event_type: str, fields: dict | None = None):
    payload = {"type": event_type}
    if fields:
        payload.update({k: v for k, v in fields.items() if v})
    res = session.post(url, json=payload, timeout=15)
    if res.status_code >= 400:
        raise RuntimeError(f"HTTP {res.status_code}")


def start_session_ping_loop(session, url: str, stop_event: threading.Event):
    while not stop_event.wait(90.0):
        try:
            post_dumper_event(session, url, "session_ping")
        except Exception as e:
            print(f"  [Live] {Colors.YELLOW}⚠ Session ping failed:{Colors.RESET} {e}")

# Default Star Citizen path locations
DEFAULT_WIN_PATH = r"C:\Program Files\Roberts Space Industries\StarCitizen"
SCAN_MAX_DEPTH = 4
try:
    from _min_game_version import MIN_GAME_VERSION
except ImportError:
    MIN_GAME_VERSION = "4.8"
try:
    from _version import __version__ as DUMPER_VERSION
except ImportError:
    DUMPER_VERSION = "dev"
DEFAULT_WEBHOOK_URL = "https://dcyugmcvlmhlfmillzma.supabase.co/functions/v1/log-watcher-webhook"
DEFAULT_RELEASES_URL = "https://github.com/Sinedrone-Sentinel/dumpers_repo/releases"

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
PATTERN_ACCEPTED = re.compile(r'Added notification "Contract Accepted:.*?MissionId: \[([^\]]+)\]')
PATTERN_END_MISSION = re.compile(
    r"<EndMission>.*MissionId\[([^\]]+)\].*CompletionType\[(\w+)\].*Reason\[([^\]]+)\]"
)
PATTERN_BLUEPRINT = re.compile(r'Added notification "Received Blueprint: ([^:]+):')
PATTERN_EXIT_MENU = re.compile(r"Requesting game mode Frontend_Main/SC_Frontend")
PATTERN_CRASH = re.compile(r"Cloud Imperium Games public crash handler taking over")
PATTERN_LOADING_PU = re.compile(r"Loading screen for pu")

CRASH_RECOVERY_WINDOW_SEC = 3600.0

BLUEPRINT_CORRELATION_WINDOW_SEC = 5.0

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
        if guid not in self.guid_map:
            self.guid_map[guid] = MissionEntry(
                debug_name=contract,
                generator=generator,
                contract_definition_id=contract_definition_id,
            )

    def record_accepted(self, guid: str, ts: float) -> ActiveMission:
        entry = self.guid_map.get(guid)
        debug_name = entry.debug_name if entry else "Unknown"
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

    def reset(self) -> None:
        self.crash_at = None
        self.paused_reason = ""
        self.pending_status = ""

    def on_log_rotation(self, state: "WatcherState") -> None:
        state.clear_all_active()
        self.crash_at = None
        self.paused_reason = "quit_game"
        self.pending_status = "quit_game"

    def process_line(self, line: str, ts: float, state: "WatcherState") -> str:
        if PATTERN_EXIT_MENU.search(line):
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
        if PATTERN_LOADING_PU.search(line):
            if self.paused_reason or self.crash_at is not None:
                if self.crash_at is not None and ts - self.crash_at > CRASH_RECOVERY_WINDOW_SEC:
                    state.clear_all_active()
                self.paused_reason = ""
                self.crash_at = None
                self.pending_status = "tracking"
                return "game_reconnected"
        return ""

    def pending_status_event(self, now: float | None = None) -> str:
        now = now if now is not None else time.time()
        if self.pending_status == "crash_waiting" and self._is_crash_recovery_expired(now):
            self.pending_status = ""
            self.crash_at = None
            return ""
        mapping = {
            "exit_menu": "game_exit_menu",
            "quit_game": "game_quit",
            "crash_waiting": "game_crash",
        }
        return mapping.get(self.pending_status, "")

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

def parse_blueprints_from_log(path: Path) -> list[str]:
    discovered = []
    state = WatcherState()
    try:
        with open(path, "rb") as f:
            for raw in f:
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                if not line:
                    continue
                ts = parse_log_timestamp(line) or 0.0

                if m := PATTERN_MARKER.search(line):
                    def_id_match = PATTERN_MARKER_DEF_ID.search(line)
                    def_id = def_id_match.group(1) if def_id_match else None
                    state.record_marker(m.group(1), m.group(2), m.group(3), def_id)

                elif m := PATTERN_ACCEPTED.search(line):
                    active = state.record_accepted(m.group(1), ts)
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
                    
                    discovered.append(product_name)
    except OSError as e:
        print(f"{Colors.YELLOW}Warning: Could not read log file {path.name} ({e}){Colors.RESET}")
    return discovered

def process_log_file(task_info):
    """Worker function for a single thread to process one file."""
    index, total, path = task_info
    if not is_log_version_allowed(path, MIN_GAME_VERSION):
        print(f"  [{index:>3}/{total}] Skipping {path.name} (game version is below minimum {MIN_GAME_VERSION})")
        return []
    size_mb = path.stat().st_size / (1024 * 1024)
    print(f"  [{index:>3}/{total}] Scanning {path.name} ({size_mb:.2f} MB)...")
    return parse_blueprints_from_log(path)

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

def apply_watch_line_to_state(line: str, state: WatcherState, session: SessionTracker | None, ts: float) -> None:
    if session is not None:
        session.process_line(line, ts, state)
    if m := PATTERN_MARKER.search(line):
        def_id_match = PATTERN_MARKER_DEF_ID.search(line)
        def_id = def_id_match.group(1) if def_id_match else None
        state.record_marker(m.group(1), m.group(2), m.group(3), def_id)
    elif m := PATTERN_ACCEPTED.search(line):
        state.record_accepted(m.group(1), ts)
    elif m := PATTERN_END_MISSION.search(line):
        state.record_end(m.group(1), m.group(2), ts)


def reconcile_active_missions_from_log(path: Path, state: WatcherState, session: SessionTracker | None = None) -> None:
    """Replay Game.log to find missions still active (accepted, not ended)."""
    state.active.clear()
    state.guid_map.clear()
    state.recent_lifecycle.clear()

    if session is None:
        session = SessionTracker()
    else:
        session.reset()

    with open(path, "r", encoding="utf-8", errors="replace") as log_file:
        for line in log_file:
            line = line.rstrip("\r\n")
            if not line:
                continue
            ts = parse_log_timestamp(line) or time.time()
            apply_watch_line_to_state(line, state, session, ts)

    if session is not None:
        session.finalize_after_reconcile(state)


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


def sync_active_missions_to_server(session, url: str, state: WatcherState) -> None:
    snapshot = list(state.active.values())
    for active in snapshot:
        post_dumper_event(session, url, "mission_started", {
            "missionGuid": active.guid,
            "contractDefinitionId": active.contract_definition_id or "",
            "debugName": active.debug_name,
        })
    if snapshot:
        print(f"{Colors.CYAN}Synced {len(snapshot)} active mission(s) already in Game.log{Colors.RESET}")


def watch_log_file(path: Path, state: WatcherState, acquired_blueprints: set, args, session=None):
    print(f"{Colors.CYAN}Watching {path.name} for live events... (Press Ctrl+C to stop){Colors.RESET}")
    ping_stop = threading.Event()
    ping_thread = None
    session_tracker = SessionTracker()

    if session and not args.dry_run:
        try:
            post_dumper_event(session, args.url, "session_start")
        except Exception as e:
            print(f"{Colors.YELLOW}⚠ Failed to notify session start:{Colors.RESET} {e}")
        ping_thread = threading.Thread(
            target=start_session_ping_loop,
            args=(session, args.url, ping_stop),
            daemon=True,
        )
        ping_thread.start()

    fh = None
    last_inode = None
    last_size = 0
    buffer = bytearray()
    first_open = True
    cache_path = Path(__file__).resolve().parent / ".dumper_cache.json"

    try:
        while True:
            try:
                st = path.stat()
            except FileNotFoundError:
                if fh:
                    fh.close()
                    fh = None
                    last_inode = None
                    buffer.clear()
                    print(f"{Colors.YELLOW}Game.log not found, waiting for it to appear...{Colors.RESET}")
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
                        except Exception:
                            pass
                    fh.close()
                    state.guid_map.clear()
                    state.recent_lifecycle.clear()
                try:
                    reconcile_active_missions_from_log(path, state, session_tracker)
                    if session and not args.dry_run:
                        try:
                            sync_active_missions_to_server(session, args.url, state)
                            pending = session_tracker.pending_status_event()
                            if pending:
                                post_game_session_event(session, args.url, pending)
                        except Exception as e:
                            print(f"{Colors.YELLOW}⚠ Could not sync active missions:{Colors.RESET} {e}")
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
                    except Exception:
                        pass

            try:
                chunk = fh.read()
            except OSError:
                time.sleep(1.0)
                continue

            if chunk:
                buffer.extend(chunk)
                nl = buffer.rfind(b"\n")
                if nl >= 0:
                    block = bytes(buffer[: nl + 1])
                    del buffer[: nl + 1]
                    for raw in block.splitlines():
                        if not raw:
                            continue
                        line = raw.decode("utf-8", errors="replace")
                        ts = parse_log_timestamp(line) or time.time()
                        ts_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))

                        game_event = session_tracker.process_line(line, ts, state)
                        if game_event and session and not args.dry_run:
                            try:
                                post_game_session_event(session, args.url, game_event)
                            except Exception as e:
                                print(f"  [Live] {Colors.RED}✗ Game status sync failed:{Colors.RESET} {e}")

                        if m := PATTERN_MARKER.search(line):
                            def_id_match = PATTERN_MARKER_DEF_ID.search(line)
                            def_id = def_id_match.group(1) if def_id_match else None
                            state.record_marker(m.group(1), m.group(2), m.group(3), def_id)

                        elif m := PATTERN_ACCEPTED.search(line):
                            active = state.record_accepted(m.group(1), ts)
                            print(f"  [{ts_str}] [{path.name}] {Colors.GREEN}Mission started: {active.debug_name} ({active.guid}){Colors.RESET}")
                            if session and not args.dry_run:
                                try:
                                    post_dumper_event(session, args.url, "mission_started", {
                                        "missionGuid": active.guid,
                                        "contractDefinitionId": active.contract_definition_id or "",
                                        "debugName": active.debug_name,
                                    })
                                except Exception as e:
                                    print(f"  [Live] {Colors.RED}✗ Mission sync failed:{Colors.RESET} {e}")

                        elif m := PATTERN_END_MISSION.search(line):
                            guid, completion, reason = m.group(1), m.group(2), m.group(3)
                            active = state.record_end(guid, completion, ts)
                            entry = state.guid_map.get(guid)
                            debug_name = active.debug_name if active else (entry.debug_name if entry else "Unknown")
                            
                            if completion == "Complete":
                                print(f"  [{ts_str}] [{path.name}] {Colors.CYAN}Mission complete: {debug_name} ({guid}) [{reason}]{Colors.RESET}")
                            elif completion == "Abandon":
                                print(f"  [{ts_str}] [{path.name}] {Colors.RED}Mission abandoned: {debug_name} ({guid}) [{reason}]{Colors.RESET}")
                            elif completion == "Fail":
                                print(f"  [{ts_str}] [{path.name}] {Colors.YELLOW}Mission failed: {debug_name} ({guid}) [{reason}]{Colors.RESET}")
                            else:
                                print(f"  [{ts_str}] [{path.name}] {Colors.YELLOW}Mission ended ({completion}): {debug_name} ({guid}) [{reason}]{Colors.RESET}")

                            if session and not args.dry_run:
                                try:
                                    post_dumper_event(session, args.url, "mission_ended", {
                                        "missionGuid": guid,
                                        "completion": completion,
                                    })
                                except Exception as e:
                                    print(f"  [Live] {Colors.RED}✗ Mission end sync failed:{Colors.RESET} {e}")

                        elif m := PATTERN_BLUEPRINT.search(line):
                            product_name = m.group(1).strip()
                            corr = state.correlate_blueprint(ts)
                            if corr:
                                print(f"  [{ts_str}] [{path.name}] {Colors.MAGENTA}Blueprint received: {Colors.GREEN}{product_name}{Colors.RESET}{Colors.MAGENTA} (from {corr.debug_name} on {corr.trigger}){Colors.RESET}")
                            else:
                                print(f"  [{ts_str}] [{path.name}] {Colors.MAGENTA}Blueprint received: {Colors.GREEN}{product_name}{Colors.RESET}{Colors.MAGENTA} (no recent mission to correlate){Colors.RESET}")
                            
                            contract_def_id = corr.contract_definition_id if corr else None

                            cache_key = cache_key_for_input(product_name)
                            if cache_key in acquired_blueprints or product_name in acquired_blueprints or is_blueprint_acquired(acquired_blueprints, product_name):
                                continue

                            if args.dry_run:
                                print(f"  [Live] {Colors.GREEN}★ Would Import (Dry Run):{Colors.RESET} {product_name}")
                                continue

                            try:
                                status, is_duplicate, internal_name = post_blueprint_event(
                                    session, args.url, product_name, contract_def_id
                                )
                                if status == 200:
                                    if is_duplicate:
                                        print(f"  [Live] {Colors.YELLOW}↻ Already Acquired (Sync):{Colors.RESET} {product_name}")
                                    else:
                                        print(f"  [Live] {Colors.GREEN}★ Successfully Imported:{Colors.RESET} {product_name}")
                                    if internal_name:
                                        acquired_blueprints.add(internal_name)
                                        save_cache_file(cache_path, acquired_blueprints)
                                elif status == 202:
                                    print(f"  [Live] {Colors.YELLOW}⚠ Notification sent — mark manually:{Colors.RESET} {product_name}")
                                else:
                                    print(f"  [Live] {Colors.RED}✗ Failed to import:{Colors.RESET} {product_name} (HTTP {status})")
                            except Exception as e:
                                print(f"  [Live] {Colors.RED}✗ Connection Error:{Colors.RESET} {product_name} ({e})")
                last_size = st.st_size
            else:
                time.sleep(0.5)
    except KeyboardInterrupt:
        print(f"\n{Colors.CYAN}Stopped watching.{Colors.RESET}")
    finally:
        ping_stop.set()
        if ping_thread:
            ping_thread.join(timeout=1.0)
        if session and not args.dry_run:
            try:
                post_dumper_event(session, args.url, "session_end")
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
        "--configure", "-c",
        action="store_true",
        help="Force running the configuration wizard."
    )

    args = parser.parse_args()

    # Load configuration from .env file
    env_path = Path(__file__).resolve().parent / ".env"
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

        # 1. Prompt file path / directory
        default_path = env_vars.get("LOG_PATH", "")
        path_prompt = "Enter path to JSON export or folder (Leave empty to auto-detect SC logs)"
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
                if fallback.is_dir():
                    live_dir = fallback / "LIVE"
                    if live_dir.is_dir():
                        print(f"{Colors.GREEN}Detected default fallback at: {live_dir}{Colors.RESET}")
                        user_path = str(live_dir)

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

        # 4. Prompt Key (only if not dry run)
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
            user_import_old = input("Import old logs on first run? (Y/N, Enter = Y): ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)
            
        import_old_logs = "true"
        if user_import_old == "n":
            import_old_logs = "false"

        print()

        # Save variables to .env file immediately
        resolved_url = args.url or env_vars.get("SUPABASE_WEBHOOK_URL") or DEFAULT_WEBHOOK_URL
        new_env = {
            "LOG_PATH": str(args.file_path) if args.file_path else "",
            "SUPABASE_WEBHOOK_URL": resolved_url if not args.dry_run else "",
            "LOG_WATCHER_API_KEY": args.key if args.key else "",
            "IMPORT_OLD_LOGS": import_old_logs,
            "WATCH_MODE": "true" if args.watch else "false"
        }
        env_vars.update(new_env)
        save_env_file(env_path, env_vars)

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

    # First run: Import old logs from backup paths if specified (runs before watch mode)
    did_import_old_logs = False
    if env_vars.get("IMPORT_OLD_LOGS") == "true":
        did_import_old_logs = True
        print(f"\n{Colors.CYAN}[First Run] Scanning historical logs in backup folder...{Colors.RESET}")
        old_log_dirs = []
        if args.log_dir:
            old_log_dirs = [args.log_dir]
        else:
            cp = None
            if args.file_path:
                if args.file_path.is_dir():
                    cp = args.file_path
                else:
                    cp = args.file_path.parent
            if not cp:
                backup_p = env_vars.get("BACKUP_PATH")
                if backup_p:
                    cp = Path(backup_p).parent
            if not cp:
                installs = detect_sc_installs()
                if installs:
                    chosen_channel = "LIVE" if "LIVE" in installs else list(installs.keys())[0]
                    cp = installs[chosen_channel]
                else:
                    fallback = Path(DEFAULT_WIN_PATH)
                    if fallback.is_dir():
                        cp = fallback / "LIVE"
            if cp:
                old_log_dirs = [cp, cp / "logbackups"]

        if old_log_dirs:
            files_to_scan = []
            for d in old_log_dirs:
                if d.is_dir():
                    # Exclude active Game.log to prevent parsing lock or watch overlap
                    for p in d.glob("*.log"):
                        if p.name != "Game.log":
                            files_to_scan.append(p)

            if files_to_scan:
                print(f"Scanning {len(files_to_scan)} historical log file(s)...")
                # Merge local translations
                for d in old_log_dirs:
                    if d.is_dir():
                        local_loc_map = parse_local_localization(d)
                        if local_loc_map:
                            register_custom_translations(local_loc_map)

                all_bps = []
                work_items = [(i, len(files_to_scan), path) for i, path in enumerate(files_to_scan, 1)]
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    for res in executor.map(process_log_file, work_items):
                        all_bps.extend(res)

                unique_old = sorted(list(set(all_bps)))
                if unique_old:
                    to_send = [bp for bp in unique_old if not is_blueprint_acquired(acquired_blueprints, bp)]

                    if to_send:
                        print(f"Uploading {len(to_send)} historical blueprints...")
                        success_count = 0
                        dupe_count = 0
                        fail_count = 0
                        for idx, bp_id in enumerate(to_send, 1):
                            if args.dry_run:
                                success_count += 1
                                resolved = resolve_blueprint_input(bp_id)
                                label = bp_id
                                if resolved.get("ok"):
                                    label = f"{resolved['blueprint_name']} → {resolved['internal_name']}"
                                elif resolved.get("error") == "ambiguous_blueprint":
                                    label = f"{bp_id} (ambiguous — would notify)"
                                print(f"  [{idx}/{len(to_send)}] {Colors.GREEN}★ Would Import:{Colors.RESET} {label}")
                            else:
                                try:
                                    status, is_duplicate, internal_name = post_blueprint_event(session, url, bp_id)
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
                                    elif status == 400:
                                        fail_count += 1
                                        print(f"  [{idx}/{len(to_send)}] {Colors.RED}✗ Unknown blueprint:{Colors.RESET} {bp_id}")
                                    else:
                                        fail_count += 1
                                        print(f"  [{idx}/{len(to_send)}] {Colors.RED}✗ Failed:{Colors.RESET} {bp_id} (HTTP {status})")
                                except Exception as e:
                                    fail_count += 1
                                    print(f"  [{idx}/{len(to_send)}] {Colors.RED}✗ Connection Error:{Colors.RESET} {bp_id} ({e})")
                        
                        print(f"\nImport complete: {Colors.GREEN}{success_count} successfully imported{Colors.RESET}, "
                              f"{Colors.YELLOW}{dupe_count} already acquired{Colors.RESET}, "
                              f"{Colors.RED}{fail_count} failed{Colors.RESET}")
                    else:
                        print("All historical blueprints already acquired.")
                else:
                    print("No blueprints found in historical logs.")
            else:
                print("No historical logs to scan.")

        # Save disabled state
        env_vars["IMPORT_OLD_LOGS"] = "false"
        save_env_file(env_path, env_vars)
        print(f"{Colors.GREEN}[First Run] Historical import complete. Disabling future auto-imports.{Colors.RESET}\n")

    # Watch Mode execution (after optional historical import)
    if args.watch:
        if did_import_old_logs:
            print(f"{Colors.CYAN}[Watch Mode] Historical import finished. Tailing Game.log for new blueprints...{Colors.RESET}\n")
        watch_file = None
        if args.file_path:
            if args.file_path.is_file():
                watch_file = args.file_path
            elif args.file_path.is_dir():
                watch_file = args.file_path / "Game.log"
        else:
            if args.log_dir:
                watch_file = args.log_dir / "Game.log"
            else:
                installs = detect_sc_installs()
                if installs:
                    chosen_channel = "LIVE" if "LIVE" in installs else list(installs.keys())[0]
                    watch_file = installs[chosen_channel] / "Game.log"
                else:
                    fallback = Path(DEFAULT_WIN_PATH)
                    if fallback.is_dir():
                        live_dir = fallback / "LIVE"
                        if live_dir.is_dir():
                            watch_file = live_dir / "Game.log"

        if not watch_file:
            print(f"{Colors.RED}Error: Could not resolve a valid directory to locate Game.log for watch mode.{Colors.RESET}", file=sys.stderr)
            print(f"Please specify the log path directly (e.g. ./dumper.sh --watch /path/to/Game.log)", file=sys.stderr)
            sys.exit(1)

        # Load local dumper cache
        cache_path = Path(__file__).resolve().parent / ".dumper_cache.json"
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

                        latest_ver = response_json.get("latestDumperVersion", "")
                        if latest_ver and latest_ver != DUMPER_VERSION:
                            print(f"{Colors.YELLOW}[Update] New dumper version available: {latest_ver} (You have {DUMPER_VERSION}).{Colors.RESET}")
                            print(f"{Colors.YELLOW}Download the latest release from: {DEFAULT_RELEASES_URL}{Colors.RESET}\n")
                else:
                    print(f"{Colors.YELLOW}Warning: Server sync returned HTTP {res.status_code}. Using local cache only.{Colors.RESET}")
            except Exception as e:
                print(f"{Colors.YELLOW}Warning: Could not sync blueprints from server ({e}). Using local cache only.{Colors.RESET}")

        # Load local translations if any
        channel_dir = watch_file.parent
        local_loc_map = parse_local_localization(channel_dir)
        if local_loc_map:
            register_custom_translations(local_loc_map)
            print(f"{Colors.GREEN}Loaded {len(local_loc_map)} custom translations from local global.ini (StarStrings/localization mod active){Colors.RESET}")

        state = WatcherState()
        watch_log_file(watch_file, state, acquired_blueprints, args, session)
        return

    unique_blueprints = []
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
                    unique_blueprints = sorted(list(set(
                        bp.get("productName") for bp in blueprints_list if bp.get("productName")
                    )))
                    source_name = args.file_path.name
                except Exception as e:
                    print(f"{Colors.RED}Error parsing JSON: {e}{Colors.RESET}", file=sys.stderr)
                    sys.exit(1)
            else:
                # Direct single log file parsing (e.g., Game.log)
                if not is_log_version_allowed(args.file_path, MIN_GAME_VERSION):
                    print(f"Skipping log file {args.file_path.name} (game version is below minimum {MIN_GAME_VERSION})")
                    sys.exit(0)
                print(f"Scanning single log file: {args.file_path.name}...")
                channel_dir = args.file_path.parent
                local_loc_map = parse_local_localization(channel_dir)
                if local_loc_map:
                    register_custom_translations(local_loc_map)
                    print(f"{Colors.GREEN}Loaded {len(local_loc_map)} custom translations from local global.ini (StarStrings/localization mod active){Colors.RESET}")

                all_bps = parse_blueprints_from_log(args.file_path)
                unique_blueprints = sorted(list(set(all_bps)))
                source_name = args.file_path.name
        elif args.file_path.is_dir():
            # Direct directory scan (e.g. logbackups folder)
            log_files = list(args.file_path.glob("*.log"))
            if not log_files:
                print(f"{Colors.RED}Error: No .log files found in directory: {args.file_path}{Colors.RESET}", file=sys.stderr)
                sys.exit(1)

            # Merge local translations if any
            local_loc_map = parse_local_localization(args.file_path)
            if not local_loc_map:
                local_loc_map = parse_local_localization(args.file_path.parent)
            if local_loc_map:
                register_custom_translations(local_loc_map)
                print(f"{Colors.GREEN}Loaded {len(local_loc_map)} custom translations from local global.ini (StarStrings/localization mod active){Colors.RESET}")

            print(f"Scanning {len(log_files)} log file(s) in {args.file_path.name} (Multithreaded)...")
            all_bps = []
            work_items = [(i, len(log_files), path) for i, path in enumerate(log_files, 1)]
            with concurrent.futures.ThreadPoolExecutor() as executor:
                for res in executor.map(process_log_file, work_items):
                    all_bps.extend(res)
            unique_blueprints = sorted(list(set(all_bps)))
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
            print(f"{Colors.RED}Error: No Star Citizen installations or log directories detected.{Colors.RESET}", file=sys.stderr)
            print(f"Please run the script pointing to your logbackups folder or a single Game.log directly:", file=sys.stderr)
            print(f"  python dumper.py --log-dir \"C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\logbackups\"", file=sys.stderr)
            sys.exit(1)

        # Collect log files
        log_files = []
        local_loaded = False
        for d in log_dirs:
            if d.is_dir():
                log_files.extend(d.glob("*.log"))
                if not local_loaded:
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

        print(f"Scanning {len(log_files)} log file(s) (Multithreaded)...")
        all_bps = []
        work_items = [(i, len(log_files), path) for i, path in enumerate(log_files, 1)]
        with concurrent.futures.ThreadPoolExecutor() as executor:
            for res in executor.map(process_log_file, work_items):
                all_bps.extend(res)
        
        unique_blueprints = sorted(list(set(all_bps)))
        source_name = f"direct log scan ({len(log_files)} file(s))"

    if not unique_blueprints:
        print(f"{Colors.YELLOW}No blueprints discovered.{Colors.RESET}")
        return

    # Load local dumper cache
    cache_path = Path(__file__).resolve().parent / ".dumper_cache.json"
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
    to_import = [bp for bp in unique_blueprints if not is_blueprint_acquired(acquired_blueprints, bp)]
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
        for idx, bp_id in enumerate(to_import, 1):
            success_count += 1
            resolved = resolve_blueprint_input(bp_id)
            label = bp_id
            if resolved.get("ok"):
                label = f"{resolved['blueprint_name']} → {resolved['internal_name']}"
            elif resolved.get("error") == "ambiguous_blueprint":
                label = f"{bp_id} (ambiguous — would notify)"
            print(f"  [{idx}/{len(to_import)}] {Colors.GREEN}★ Would Import:{Colors.RESET} {label}")
    else:
        for idx, bp_id in enumerate(to_import, 1):
            try:
                status, is_duplicate, internal_name = post_blueprint_event(session, args.url, bp_id)
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
                elif status == 400:
                    fail_count += 1
                    print(f"  [{idx}/{len(to_import)}] {Colors.RED}✗ Unknown blueprint:{Colors.RESET} {bp_id}")
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
