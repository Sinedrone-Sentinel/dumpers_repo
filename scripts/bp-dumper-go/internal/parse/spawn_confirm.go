package parse

import "strings"

type SpawnConfirmTracker struct {
	SpawnTS    *float64
	PreActive  map[string]struct{}
	Confirmed  map[string]struct{}
	SawAccept  bool
}

func NewSpawnConfirmTracker() *SpawnConfirmTracker {
	t := &SpawnConfirmTracker{}
	t.Reset()
	return t
}

func (t *SpawnConfirmTracker) Reset() {
	t.SpawnTS = nil
	t.PreActive = map[string]struct{}{}
	t.Confirmed = map[string]struct{}{}
	t.SawAccept = false
}

func (t *SpawnConfirmTracker) Open(ts float64, activeGUIDs []string) {
	t.SpawnTS = &ts
	t.PreActive = map[string]struct{}{}
	t.Confirmed = map[string]struct{}{}
	t.SawAccept = false
	for _, guid := range activeGUIDs {
		if guid != "" && guid != ZeroMissionGUID {
			t.PreActive[guid] = struct{}{}
		}
	}
}

func (t *SpawnConfirmTracker) Confirm(guid string, fromAccept bool) {
	if t == nil || t.SpawnTS == nil || guid == "" || guid == ZeroMissionGUID {
		return
	}
	t.Confirmed[guid] = struct{}{}
	if fromAccept {
		t.SawAccept = true
	}
}

func (t *SpawnConfirmTracker) Flush(state *WatcherState) []string {
	if t == nil || t.SpawnTS == nil {
		return nil
	}
	var dropped []string
	if t.SawAccept && state != nil {
		for guid := range t.PreActive {
			if _, ok := t.Confirmed[guid]; ok {
				continue
			}
			if _, ok := state.Active[guid]; ok {
				delete(state.Active, guid)
				dropped = append(dropped, guid)
			}
		}
	}
	t.Reset()
	return dropped
}

func (t *SpawnConfirmTracker) Advance(ts float64, state *WatcherState) []string {
	if t == nil || t.SpawnTS == nil {
		return nil
	}
	if ts < *t.SpawnTS+SpawnConfirmWindowSec {
		return nil
	}
	return t.Flush(state)
}

func ConfirmGUIDFromLine(line string) (guid string, fromAccept bool) {
	if strings.Contains(line, "Contract Shared:") {
		return "", false
	}
	if m := PatternAccepted.FindStringSubmatch(line); m != nil {
		idx := PatternAccepted.SubexpIndex("guid")
		if idx >= 0 {
			guid = strings.TrimSpace(m[idx])
			if guid != "" && guid != ZeroMissionGUID {
				return guid, true
			}
		}
	}
	if m := PatternAcceptedFallback.FindStringSubmatch(line); m != nil {
		idx := PatternAcceptedFallback.SubexpIndex("guid")
		if idx >= 0 {
			guid = strings.TrimSpace(m[idx])
			if guid != "" && guid != ZeroMissionGUID {
				return guid, true
			}
		}
	}
	if m := PatternMissionContract.FindStringSubmatch(line); m != nil {
		guid = strings.TrimSpace(m[1])
		if guid != "" && guid != ZeroMissionGUID {
			return guid, false
		}
	}
	return "", false
}

func activeGUIDs(state *WatcherState) []string {
	if state == nil {
		return nil
	}
	out := make([]string, 0, len(state.Active))
	for guid := range state.Active {
		out = append(out, guid)
	}
	return out
}

// IngestMissionLine applies accept/end plus spawn-confirm prune.
func IngestMissionLine(line string, state *WatcherState, ts float64) (active *ActiveMission, dropped []string) {
	if state.SpawnConfirm == nil {
		state.SpawnConfirm = NewSpawnConfirmTracker()
	}
	pruner := state.SpawnConfirm
	dropped = pruner.Advance(ts, state)
	if PatternClientSpawned.MatchString(line) {
		if pruner.SpawnTS != nil {
			dropped = append(dropped, pruner.Flush(state)...)
		}
		pruner.Open(ts, activeGUIDs(state))
	}
	active = ApplyMissionLogLine(line, state, ts)
	if guid, fromAccept := ConfirmGUIDFromLine(line); guid != "" {
		pruner.Confirm(guid, fromAccept)
	}
	return active, dropped
}
