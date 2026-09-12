package parse

import (
	"fmt"
	"testing"
)

func acceptLine(ts, title, guid string) string {
	return fmt.Sprintf(
		`<%s> [Notice] <SHUDEvent_OnNotification> Added notification "Contract Accepted:  %s: " [1] to queue. New queue size: 1, MissionId: [%s], ObjectiveId: []`,
		ts, title, guid,
	)
}

func spawnLine(ts string) string {
	return fmt.Sprintf("<%s> [CSessionManager::OnClientSpawned] Spawned!", ts)
}

func endLine(ts, guid string) string {
	return fmt.Sprintf(
		`<%s> [Notice] <EndMission> Ending mission for player. MissionId[%s] Player[X] PlayerId[1] CompletionType[Abandon] Reason[Player left]`,
		ts, guid,
	)
}

func sharedLine(ts, title string) string {
	return fmt.Sprintf(
		`<%s> [Notice] <SHUDEvent_OnNotification> Added notification "Contract Shared: %s: " [1] to queue. New queue size: 1, MissionId: [%s], ObjectiveId: []`,
		ts, title, ZeroMissionGUID,
	)
}

func laterLine(ts string) string {
	return fmt.Sprintf("<%s> [Notice] <Noise> keep-alive", ts)
}

func replay(lines []string) *WatcherState {
	state := NewWatcherState()
	var ts float64
	for _, line := range lines {
		if parsed, ok := ParseLogTimestamp(line); ok {
			ts = parsed
		}
		IngestMissionLine(line, state, ts)
	}
	state.SpawnConfirm.Flush(state)
	return state
}

func activeSet(state *WatcherState) map[string]struct{} {
	out := map[string]struct{}{}
	for guid := range state.Active {
		out[guid] = struct{}{}
	}
	return out
}

func TestSpawnConfirmKeepsReListedMissions(t *testing.T) {
	energy := "ca21a2b5-8902-4847-91b1-da84958333b6"
	power := "e950576a-b67d-46c4-9cf9-ca0b7da15ff1"
	lab := "3aa5fc95-f21d-4ab9-8bd7-00fe15a498e0"
	sec := "3f868402-1692-4ee0-802f-2a9f9892a170"
	state := replay([]string{
		acceptLine("2026-09-12T19:03:02.591Z", "Energy", energy),
		acceptLine("2026-09-12T19:03:03.068Z", "Power", power),
		acceptLine("2026-09-12T19:03:03.692Z", "Lab Sample", lab),
		acceptLine("2026-09-12T19:03:22.304Z", "Security", sec),
		spawnLine("2026-09-12T19:06:50.548Z"),
		acceptLine("2026-09-12T19:06:50.951Z", "Energy", energy),
		acceptLine("2026-09-12T19:06:50.951Z", "Power", power),
		acceptLine("2026-09-12T19:06:50.952Z", "Lab Sample", lab),
		acceptLine("2026-09-12T19:06:50.952Z", "Security", sec),
		laterLine("2026-09-12T19:07:00.000Z"),
	})
	if len(state.Active) != 4 {
		t.Fatalf("kept %d missions, want 4: %#v", len(state.Active), activeSet(state))
	}
}

func TestSpawnConfirmDropsGhostsNotReListed(t *testing.T) {
	energy := "ca21a2b5-8902-4847-91b1-da84958333b6"
	power := "e950576a-b67d-46c4-9cf9-ca0b7da15ff1"
	lab := "3aa5fc95-f21d-4ab9-8bd7-00fe15a498e0"
	sec := "3f868402-1692-4ee0-802f-2a9f9892a170"
	state := replay([]string{
		acceptLine("2026-09-12T19:36:17.549Z", "Energy", energy),
		acceptLine("2026-09-12T19:36:17.549Z", "Lab Sample", lab),
		acceptLine("2026-09-12T19:36:17.549Z", "Security", sec),
		acceptLine("2026-09-12T19:36:58.671Z", "Power", power),
		spawnLine("2026-09-12T20:18:46.061Z"),
		acceptLine("2026-09-12T20:18:46.422Z", "Lab Sample", lab),
		laterLine("2026-09-12T20:18:55.000Z"),
	})
	if len(state.Active) != 1 {
		t.Fatalf("kept %d missions, want 1: %#v", len(state.Active), activeSet(state))
	}
	if _, ok := state.Active[lab]; !ok {
		t.Fatal("Lab Sample should remain after Orison spawn")
	}
}

func TestSpawnConfirmNoAcceptLeavesListAlone(t *testing.T) {
	lab := "3aa5fc95-f21d-4ab9-8bd7-00fe15a498e0"
	sec := "3f868402-1692-4ee0-802f-2a9f9892a170"
	state := replay([]string{
		acceptLine("2026-09-12T19:03:03.692Z", "Lab Sample", lab),
		acceptLine("2026-09-12T19:03:22.304Z", "Security", sec),
		spawnLine("2026-09-12T19:10:00.000Z"),
		laterLine("2026-09-12T19:10:09.000Z"),
	})
	if len(state.Active) != 2 {
		t.Fatalf("spawn with no Contract Accepted must not prune, got %d", len(state.Active))
	}
}

func TestEndMissionStillRemovesImmediately(t *testing.T) {
	power := "e950576a-b67d-46c4-9cf9-ca0b7da15ff1"
	lab := "3aa5fc95-f21d-4ab9-8bd7-00fe15a498e0"
	state := replay([]string{
		acceptLine("2026-09-12T19:03:03.068Z", "Power", power),
		acceptLine("2026-09-12T19:03:03.692Z", "Lab Sample", lab),
		endLine("2026-09-12T19:29:04.239Z", power),
	})
	if _, ok := state.Active[power]; ok {
		t.Fatal("abandoned mission should be gone")
	}
	if _, ok := state.Active[lab]; !ok {
		t.Fatal("Lab Sample should remain")
	}
}

func TestContractSharedDoesNotConfirm(t *testing.T) {
	energy := "ca21a2b5-8902-4847-91b1-da84958333b6"
	lab := "3aa5fc95-f21d-4ab9-8bd7-00fe15a498e0"
	state := replay([]string{
		acceptLine("2026-09-12T19:03:02.591Z", "Energy", energy),
		acceptLine("2026-09-12T19:03:03.692Z", "Lab Sample", lab),
		spawnLine("2026-09-12T20:18:46.061Z"),
		sharedLine("2026-09-12T20:18:46.100Z", "Energy"),
		acceptLine("2026-09-12T20:18:46.422Z", "Lab Sample", lab),
		laterLine("2026-09-12T20:18:55.000Z"),
	})
	if _, ok := state.Active[energy]; ok {
		t.Fatal("shared-only mission must not count as spawn confirm")
	}
	if _, ok := state.Active[lab]; !ok {
		t.Fatal("Lab Sample should remain")
	}
}
