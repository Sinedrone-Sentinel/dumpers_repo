package parse

import (
	"bufio"
	"os"
	"time"
)

type SessionTracker struct {
	CrashAt       *float64
	PausedReason  string
	PendingStatus string
	LastLogTS     *float64
}

func (s *SessionTracker) Reset() {
	s.CrashAt = nil
	s.PausedReason = ""
	s.PendingStatus = ""
	s.LastLogTS = nil
}

func (s *SessionTracker) ResolveTimestamp(line string) float64 {
	if ts, ok := ParseLogTimestamp(line); ok {
		s.LastLogTS = &ts
		return ts
	}
	if s.LastLogTS != nil {
		return *s.LastLogTS
	}
	return float64(time.Now().Unix())
}

func (s *SessionTracker) OnLogRotation(state *WatcherState) {
	state.ClearAllActive()
	s.CrashAt = nil
	s.PausedReason = "quit_game"
	s.PendingStatus = "quit_game"
	s.LastLogTS = nil
}

func (s *SessionTracker) OnMissionAccepted() {
	s.PendingStatus = "tracking"
	s.PausedReason = ""
	s.CrashAt = nil
}

func (s *SessionTracker) MarkBackInPU(state *WatcherState, ts float64) {
	if s.CrashAt != nil && ts-*s.CrashAt > CrashRecoveryWindowSec {
		state.ClearAllActive()
	}
	s.PausedReason = ""
	s.CrashAt = nil
	s.PendingStatus = "tracking"
}

func (s *SessionTracker) ResumeFromPause(state *WatcherState, ts float64) string {
	if s.PausedReason == "" && s.CrashAt == nil {
		return ""
	}
	s.MarkBackInPU(state, ts)
	return "game_reconnected"
}

func (s *SessionTracker) ProcessLine(line string, ts float64, state *WatcherState) string {
	if PatternLogStarted.MatchString(line) {
		state.ClearAllActive()
		s.PausedReason = "quit_game"
		s.CrashAt = nil
		s.PendingStatus = "quit_game"
		return "game_quit"
	}
	if PatternExitMenu.MatchString(line) {
		state.ClearAllActive()
		s.PausedReason = "exit_menu"
		s.CrashAt = nil
		s.PendingStatus = "exit_menu"
		return "game_exit_menu"
	}
	if PatternCrash.MatchString(line) {
		s.CrashAt = &ts
		if float64(time.Now().Unix())-ts > CrashRecoveryWindowSec {
			s.CrashAt = nil
			return ""
		}
		s.PendingStatus = "crash_waiting"
		return "game_crash"
	}
	if IsPUEntryLine(line) {
		return s.ResumeFromPause(state, ts)
	}
	return ""
}

func (s *SessionTracker) isCrashExpired(now float64) bool {
	return s.CrashAt != nil && now-*s.CrashAt > CrashRecoveryWindowSec
}

func (s *SessionTracker) PendingStatusEvent(now float64) string {
	if s.PendingStatus == "crash_waiting" && s.isCrashExpired(now) {
		s.PendingStatus = ""
		s.CrashAt = nil
		return ""
	}
	switch s.PendingStatus {
	case "tracking":
		return "game_tracking"
	case "exit_menu":
		return "game_exit_menu"
	case "quit_game":
		return "game_quit"
	case "crash_waiting":
		return "game_crash"
	default:
		return ""
	}
}

func (s *SessionTracker) FinalizeAfterReconcile(state *WatcherState) {
	now := float64(time.Now().Unix())
	if !s.isCrashExpired(now) {
		return
	}
	state.ClearAllActive()
	s.CrashAt = nil
	if s.PendingStatus == "crash_waiting" {
		s.PendingStatus = ""
	}
}

func (s *SessionTracker) ExpireStaleCrashIfNeeded(state *WatcherState) string {
	now := float64(time.Now().Unix())
	if s.PendingStatus != "crash_waiting" || !s.isCrashExpired(now) {
		return ""
	}
	state.ClearAllActive()
	s.CrashAt = nil
	s.PendingStatus = ""
	return "game_tracking"
}

func IsLiveMissionSyncReady(session *SessionTracker) bool {
	switch session.PendingStatus {
	case "exit_menu", "quit_game", "crash_waiting":
		return false
	}
	switch session.PausedReason {
	case "exit_menu", "quit_game":
		return false
	}
	return true
}

func EnsureAwaitingPU(session *SessionTracker) {
	if IsLiveMissionSyncReady(session) {
		return
	}
	if session.PausedReason == "" && session.PendingStatus == "" {
		session.PausedReason = "quit_game"
		session.PendingStatus = "quit_game"
	}
}

func ReconcileActiveMissionsFromLog(path string, state *WatcherState, session *SessionTracker) error {
	state.Active = map[string]*ActiveMission{}
	state.GUIDMap = map[string]*MissionEntry{}
	state.RecentLifecycle = nil

	replay := &SessionTracker{}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	// Large Game.log lines
	buf := make([]byte, 0, 1024*1024)
	sc.Buffer(buf, 16*1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			continue
		}
		ts := replay.ResolveTimestamp(line)
		replay.ProcessLine(line, ts, state)
		if ApplyMissionLogLine(line, state, ts) != nil {
			replay.OnMissionAccepted()
		}
	}
	replay.FinalizeAfterReconcile(state)
	if session != nil && len(state.Active) > 0 {
		session.OnMissionAccepted()
	}
	return sc.Err()
}

func SeedSessionTrackerFromLog(path string, session *SessionTracker) error {
	session.Reset()
	scratch := NewWatcherState()
	tsSession := &SessionTracker{}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	buf := make([]byte, 0, 1024*1024)
	sc.Buffer(buf, 16*1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			continue
		}
		ts := tsSession.ResolveTimestamp(line)
		session.ProcessLine(line, ts, scratch)
	}
	session.FinalizeAfterReconcile(scratch)
	return sc.Err()
}
