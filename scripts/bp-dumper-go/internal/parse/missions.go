package parse

import (
	"strings"
	"time"
)

type MissionEntry struct {
	DebugName            string
	Generator            string
	ContractDefinitionID string
}

type ActiveMission struct {
	GUID                 string
	DebugName            string
	Generator            string
	StartTS              float64
	ContractDefinitionID string
}

type MissionLifecycleEvent struct {
	Trigger              string
	GUID                 string
	DebugName            string
	TS                   float64
	ContractDefinitionID string
}

type WatcherState struct {
	GUIDMap         map[string]*MissionEntry
	Active          map[string]*ActiveMission
	RecentLifecycle []*MissionLifecycleEvent
}

func NewWatcherState() *WatcherState {
	return &WatcherState{
		GUIDMap: map[string]*MissionEntry{},
		Active:  map[string]*ActiveMission{},
	}
}

func (s *WatcherState) recordLifecycle(e *MissionLifecycleEvent) {
	s.RecentLifecycle = append(s.RecentLifecycle, e)
	if len(s.RecentLifecycle) > 32 {
		s.RecentLifecycle = s.RecentLifecycle[len(s.RecentLifecycle)-32:]
	}
}

func (s *WatcherState) RecordMarker(guid, generator, contract, contractDefinitionID string) {
	existing := s.GUIDMap[guid]
	if existing != nil {
		if contract != "" && (existing.DebugName == "" || existing.DebugName == "Unknown") {
			existing.DebugName = contract
		}
		if generator != "" && (existing.Generator == "" || existing.Generator == "Unknown") {
			existing.Generator = generator
		}
		if contractDefinitionID != "" && existing.ContractDefinitionID == "" {
			existing.ContractDefinitionID = contractDefinitionID
		}
		return
	}
	s.GUIDMap[guid] = &MissionEntry{
		DebugName:            contract,
		Generator:            generator,
		ContractDefinitionID: contractDefinitionID,
	}
}

func (s *WatcherState) RecordAccepted(guid string, ts float64, title string) *ActiveMission {
	entry := s.GUIDMap[guid]
	acceptTitle := strings.TrimSpace(title)
	if acceptTitle != "" {
		if entry != nil {
			entry.DebugName = acceptTitle
		} else {
			entry = &MissionEntry{DebugName: acceptTitle}
			s.GUIDMap[guid] = entry
		}
	}
	debugName := acceptTitle
	if debugName == "" && entry != nil {
		debugName = entry.DebugName
	}
	if debugName == "" {
		debugName = "Unknown"
	}
	generator := "Unknown"
	var defID string
	if entry != nil {
		if entry.Generator != "" {
			generator = entry.Generator
		}
		defID = entry.ContractDefinitionID
	}
	active := &ActiveMission{
		GUID:                 guid,
		DebugName:            debugName,
		Generator:            generator,
		StartTS:              ts,
		ContractDefinitionID: defID,
	}
	s.Active[guid] = active
	s.recordLifecycle(&MissionLifecycleEvent{
		Trigger: "accept", GUID: guid, DebugName: debugName, TS: ts, ContractDefinitionID: defID,
	})
	return active
}

func (s *WatcherState) RecordEnd(guid, completion string, ts float64) *ActiveMission {
	active := s.Active[guid]
	delete(s.Active, guid)
	entry := s.GUIDMap[guid]
	debugName := "Unknown"
	var defID string
	if active != nil {
		debugName = active.DebugName
		defID = active.ContractDefinitionID
	} else if entry != nil {
		debugName = entry.DebugName
		defID = entry.ContractDefinitionID
	}
	if completion == "Complete" {
		s.recordLifecycle(&MissionLifecycleEvent{
			Trigger: "complete", GUID: guid, DebugName: debugName, TS: ts, ContractDefinitionID: defID,
		})
	}
	return active
}

func (s *WatcherState) ClearAllActive() {
	s.Active = map[string]*ActiveMission{}
}

func (s *WatcherState) CorrelateBlueprint(ts float64) *MissionLifecycleEvent {
	var best *MissionLifecycleEvent
	bestDelta := BlueprintCorrelationWindow + 1
	for _, e := range s.RecentLifecycle {
		delta := ts - e.TS
		if delta >= 0 && delta <= BlueprintCorrelationWindow && delta < bestDelta {
			best = e
			bestDelta = delta
		}
	}
	return best
}

func NormalizeAcceptNotificationTitle(raw string) string {
	if raw == "" {
		return ""
	}
	text := HTMLTagRE.ReplaceAllString(strings.TrimSpace(raw), "")
	if rep := RepInTitleRE.FindStringSubmatchIndex(text); rep != nil {
		before := strings.TrimSpace(strings.TrimRight(text[:rep[0]], `:"' `))
		if before != "" {
			groups := RepInTitleRE.FindStringSubmatch(text)
			return before + " [" + groups[1] + "/" + groups[2] + " Rep]"
		}
	}
	parts := LogNoiseTailRE.Split(text, 2)
	text = strings.TrimSpace(strings.TrimRight(parts[0], `:"' ,`))
	return text
}

func IsPUEntryLine(line string) bool {
	if m := PatternLoadingPU.FindStringSubmatch(line); m != nil {
		system := strings.TrimSpace(m[1])
		// Reject menu Frontend_Main*; keep Pyro / Nyx / Stanton / pu / etc.
		if system != "" && !strings.HasPrefix(strings.ToLower(system), "frontend_main") {
			return true
		}
	}
	if m := PatternPUEntered.FindStringSubmatch(line); m != nil {
		rules := m[1]
		if rules != "" && !strings.HasPrefix(strings.ToLower(rules), "frontend") {
			return true
		}
	}
	return false
}

func ParseLogTimestamp(line string) (float64, bool) {
	m := PatternTimestamp.FindStringSubmatch(line)
	if m == nil {
		return 0, false
	}
	raw := strings.Replace(m[1], "Z", "+00:00", 1)
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05.999999999-07:00", raw)
	}
	if err != nil {
		// Common SC form without offset already handled; try without timezone
		t, err = time.Parse("2006-01-02T15:04:05.999999999", strings.TrimSuffix(m[1], "Z"))
	}
	if err != nil {
		return 0, false
	}
	return float64(t.Unix()) + float64(t.Nanosecond())/1e9, true
}

// ApplyMissionLogLine parses marker/accept/end. Returns active mission when accepted.
// Note: EndMission is recorded here (same as Python).
func ApplyMissionLogLine(line string, state *WatcherState, ts float64) *ActiveMission {
	if m := PatternMissionContract.FindStringSubmatch(line); m != nil {
		generator := ""
		if g := PatternMissionGenerator.FindStringSubmatch(line); g != nil {
			generator = g[1]
		}
		defID := ""
		if d := PatternMarkerDefID.FindStringSubmatch(line); d != nil {
			defID = d[1]
		}
		state.RecordMarker(m[1], generator, m[2], defID)
		return nil
	}
	if m := PatternAccepted.FindStringSubmatch(line); m != nil {
		titleIdx := PatternAccepted.SubexpIndex("title")
		guidIdx := PatternAccepted.SubexpIndex("guid")
		title := ""
		if titleIdx >= 0 {
			title = NormalizeAcceptNotificationTitle(m[titleIdx])
		}
		return state.RecordAccepted(m[guidIdx], ts, title)
	}
	if m := PatternAcceptedFallback.FindStringSubmatch(line); m != nil {
		guidIdx := PatternAcceptedFallback.SubexpIndex("guid")
		return state.RecordAccepted(m[guidIdx], ts, "")
	}
	if m := PatternEndMission.FindStringSubmatch(line); m != nil {
		state.RecordEnd(m[1], m[2], ts)
		return nil
	}
	return nil
}
