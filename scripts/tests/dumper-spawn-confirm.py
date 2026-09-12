#!/usr/bin/env python3
"""Spawn-confirm prune tests for BP Dumper (Python)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "bp-dumper-py"))

from dumper import (  # noqa: E402
    ZERO_MISSION_GUID,
    WatcherState,
    ingest_mission_line,
    parse_log_timestamp,
)


def accept_line(ts: str, title: str, guid: str) -> str:
    return (
        f'<{ts}> [Notice] <SHUDEvent_OnNotification> Added notification '
        f'"Contract Accepted:  {title}: " [1] to queue. New queue size: 1, '
        f"MissionId: [{guid}], ObjectiveId: []"
    )


def spawn_line(ts: str) -> str:
    return f"<{ts}> [CSessionManager::OnClientSpawned] Spawned!"


def end_line(ts: str, guid: str) -> str:
    return (
        f"<{ts}> [Notice] <EndMission> Ending mission for player. "
        f"MissionId[{guid}] Player[X] PlayerId[1] CompletionType[Abandon] Reason[Player left]"
    )


def shared_line(ts: str, title: str) -> str:
    return (
        f'<{ts}> [Notice] <SHUDEvent_OnNotification> Added notification '
        f'"Contract Shared: {title}: " [1] to queue. New queue size: 1, '
        f"MissionId: [{ZERO_MISSION_GUID}], ObjectiveId: []"
    )


def later_line(ts: str) -> str:
    return f"<{ts}> [Notice] <Noise> keep-alive"


def replay(lines: list[str]) -> WatcherState:
    state = WatcherState()
    ts = 0.0
    for line in lines:
        parsed = parse_log_timestamp(line)
        if parsed is not None:
            ts = parsed
        ingest_mission_line(line, state, ts)
    state.spawn_confirm.flush(state)
    return state


def check(cond: bool, message: str) -> None:
    if not cond:
        raise AssertionError(message)


ENERGY = "ca21a2b5-8902-4847-91b1-da84958333b6"
POWER = "e950576a-b67d-46c4-9cf9-ca0b7da15ff1"
LAB = "3aa5fc95-f21d-4ab9-8bd7-00fe15a498e0"
SEC = "3f868402-1692-4ee0-802f-2a9f9892a170"


def main() -> None:
    kept = replay(
        [
            accept_line("2026-09-12T19:03:02.591Z", "Energy", ENERGY),
            accept_line("2026-09-12T19:03:03.068Z", "Power", POWER),
            accept_line("2026-09-12T19:03:03.692Z", "Lab Sample", LAB),
            accept_line("2026-09-12T19:03:22.304Z", "Security", SEC),
            spawn_line("2026-09-12T19:06:50.548Z"),
            accept_line("2026-09-12T19:06:50.951Z", "Energy", ENERGY),
            accept_line("2026-09-12T19:06:50.951Z", "Power", POWER),
            accept_line("2026-09-12T19:06:50.952Z", "Lab Sample", LAB),
            accept_line("2026-09-12T19:06:50.952Z", "Security", SEC),
            later_line("2026-09-12T19:07:00.000Z"),
        ]
    )
    check(len(kept.active) == 4, f"re-listed spawn should keep 4, got {len(kept.active)}")

    pruned = replay(
        [
            accept_line("2026-09-12T19:36:17.549Z", "Energy", ENERGY),
            accept_line("2026-09-12T19:36:17.549Z", "Lab Sample", LAB),
            accept_line("2026-09-12T19:36:17.549Z", "Security", SEC),
            accept_line("2026-09-12T19:36:58.671Z", "Power", POWER),
            spawn_line("2026-09-12T20:18:46.061Z"),
            accept_line("2026-09-12T20:18:46.422Z", "Lab Sample", LAB),
            later_line("2026-09-12T20:18:55.000Z"),
        ]
    )
    check(len(pruned.active) == 1, f"Orison spawn should keep 1, got {len(pruned.active)}")
    check(LAB in pruned.active, "Lab Sample should remain after Orison spawn")

    untouched = replay(
        [
            accept_line("2026-09-12T19:03:03.692Z", "Lab Sample", LAB),
            accept_line("2026-09-12T19:03:22.304Z", "Security", SEC),
            spawn_line("2026-09-12T19:10:00.000Z"),
            later_line("2026-09-12T19:10:09.000Z"),
        ]
    )
    check(len(untouched.active) == 2, "spawn with no Contract Accepted must not prune")

    ended = replay(
        [
            accept_line("2026-09-12T19:03:03.068Z", "Power", POWER),
            accept_line("2026-09-12T19:03:03.692Z", "Lab Sample", LAB),
            end_line("2026-09-12T19:29:04.239Z", POWER),
        ]
    )
    check(POWER not in ended.active, "abandoned mission should be gone")
    check(LAB in ended.active, "Lab Sample should remain")

    shared = replay(
        [
            accept_line("2026-09-12T19:03:02.591Z", "Energy", ENERGY),
            accept_line("2026-09-12T19:03:03.692Z", "Lab Sample", LAB),
            spawn_line("2026-09-12T20:18:46.061Z"),
            shared_line("2026-09-12T20:18:46.100Z", "Energy"),
            accept_line("2026-09-12T20:18:46.422Z", "Lab Sample", LAB),
            later_line("2026-09-12T20:18:55.000Z"),
        ]
    )
    check(ENERGY not in shared.active, "shared-only mission must not count as spawn confirm")
    check(LAB in shared.active, "Lab Sample should remain")

    print("Dumper spawn-confirm tests: 5 passed")


if __name__ == "__main__":
    main()
