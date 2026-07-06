package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Default Star Citizen path locations
const DefaultWinPath = `C:\Program Files\Roberts Space Industries\StarCitizen`

type Colors struct {
	Green   string
	Cyan    string
	Yellow  string
	Red     string
	Magenta string
	Dim     string
	Reset   string
}

var color = Colors{
	Green:   "\033[92m",
	Cyan:    "\033[96m",
	Yellow:  "\033[93m",
	Red:     "\033[91m",
	Magenta: "\033[95m",
	Dim:     "\033[2m",
	Reset:   "\033[0m",
}

func disableColors() {
	color.Green = ""
	color.Cyan = ""
	color.Yellow = ""
	color.Red = ""
	color.Magenta = ""
	color.Dim = ""
	color.Reset = ""
}

// Log parsing patterns
var (
	patternTimestamp   = regexp.MustCompile(`^<([0-9T:\-.Z]+)>`)
	patternMarker      = regexp.MustCompile(`CreateMarker.*missionId \[([^\]]+)\].*generator name \[([^\]]+)\].*contract \[([^\]]+)\]`)
	patternMarkerDefID = regexp.MustCompile(`contractDefinitionId\[([^\]]+)\]`)
	patternAccepted    = regexp.MustCompile(`Added notification "Contract Accepted:.*?MissionId: \[([^\]]+)\]`)
	patternEndMission  = regexp.MustCompile(`<EndMission>.*MissionId\[([^\]]+)\].*CompletionType\[(\w+)\].*Reason\[([^\]]+)\]`)
	patternBlueprint   = regexp.MustCompile(`Added notification "Received Blueprint: ([^:]+):`)
	patternExitMenu    = regexp.MustCompile(`Requesting game mode Frontend_Main/SC_Frontend`)
	patternCrash       = regexp.MustCompile(`Cloud Imperium Games public crash handler taking over`)
	patternLoadingPU   = regexp.MustCompile(`Loading screen for pu`)
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
	StartTS              time.Time
	ContractDefinitionID string
}

type MissionLifecycleEvent struct {
	Trigger              string
	GUID                 string
	DebugName            string
	TS                   time.Time
	ContractDefinitionID string
}

type WatcherState struct {
	mu              sync.Mutex
	guidMap         map[string]MissionEntry
	active          map[string]ActiveMission
	recentLifecycle []MissionLifecycleEvent
}

const crashRecoveryWindow = time.Hour

type SessionTracker struct {
	mu            sync.Mutex
	crashAt       time.Time
	pausedReason  string
	pendingStatus string
	lastLogTS     time.Time
}

func NewSessionTracker() *SessionTracker {
	return &SessionTracker{}
}

func (st *SessionTracker) Reset() {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.crashAt = time.Time{}
	st.pausedReason = ""
	st.pendingStatus = ""
	st.lastLogTS = time.Time{}
}

// ResolveTimestamp uses the line prefix when present; crash-handler blocks inherit the prior log timestamp.
func (st *SessionTracker) ResolveTimestamp(line string) time.Time {
	ts := parseLogTimestamp(line)
	st.mu.Lock()
	defer st.mu.Unlock()
	if !ts.IsZero() {
		st.lastLogTS = ts
		return ts
	}
	if !st.lastLogTS.IsZero() {
		return st.lastLogTS
	}
	return time.Now()
}

func (st *SessionTracker) OnLogRotation(state *WatcherState) {
	st.mu.Lock()
	defer st.mu.Unlock()
	state.ClearAllActive()
	st.crashAt = time.Time{}
	st.pausedReason = "quit_game"
	st.pendingStatus = "quit_game"
	st.lastLogTS = time.Time{}
}

func (st *SessionTracker) ProcessLine(line string, ts time.Time, state *WatcherState) string {
	st.mu.Lock()
	defer st.mu.Unlock()

	if patternExitMenu.MatchString(line) {
		state.ClearAllActive()
		st.pausedReason = "exit_menu"
		st.crashAt = time.Time{}
		st.pendingStatus = "exit_menu"
		return "game_exit_menu"
	}
	if patternCrash.MatchString(line) {
		st.crashAt = ts
		if time.Since(ts) > crashRecoveryWindow {
			st.crashAt = time.Time{}
			return ""
		}
		st.pendingStatus = "crash_waiting"
		return "game_crash"
	}
	if patternLoadingPU.MatchString(line) {
		if st.pausedReason != "" || !st.crashAt.IsZero() {
			if !st.crashAt.IsZero() && ts.Sub(st.crashAt) > crashRecoveryWindow {
				state.ClearAllActive()
			}
			st.pausedReason = ""
			st.crashAt = time.Time{}
			st.pendingStatus = "tracking"
			return "game_reconnected"
		}
	}
	return ""
}

func (st *SessionTracker) PendingStatusEvent(now time.Time) string {
	st.mu.Lock()
	defer st.mu.Unlock()
	if st.pendingStatus == "crash_waiting" && st.isCrashRecoveryExpired(now) {
		st.pendingStatus = ""
		st.crashAt = time.Time{}
		return ""
	}
	switch st.pendingStatus {
	case "exit_menu":
		return "game_exit_menu"
	case "quit_game":
		return "game_quit"
	case "crash_waiting":
		return "game_crash"
	case "tracking", "":
		return ""
	default:
		return ""
	}
}

func (st *SessionTracker) isCrashRecoveryExpired(now time.Time) bool {
	return !st.crashAt.IsZero() && now.Sub(st.crashAt) > crashRecoveryWindow
}

// FinalizeAfterReconcile clears stale crash recovery state from historical log replay.
func (st *SessionTracker) FinalizeAfterReconcile(state *WatcherState, now time.Time) {
	st.mu.Lock()
	defer st.mu.Unlock()
	if !st.isCrashRecoveryExpired(now) {
		return
	}
	state.ClearAllActive()
	st.crashAt = time.Time{}
	if st.pendingStatus == "crash_waiting" {
		st.pendingStatus = ""
	}
}

// ExpireStaleCrashIfNeeded returns game_tracking when the crash recovery window has elapsed.
func (st *SessionTracker) ExpireStaleCrashIfNeeded(state *WatcherState, now time.Time) string {
	st.mu.Lock()
	defer st.mu.Unlock()
	if st.pendingStatus != "crash_waiting" || !st.isCrashRecoveryExpired(now) {
		return ""
	}
	state.ClearAllActive()
	st.crashAt = time.Time{}
	st.pendingStatus = ""
	return "game_tracking"
}

func (st *SessionTracker) ClearPendingStatus() {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.pendingStatus = ""
}

func NewWatcherState() *WatcherState {
	return &WatcherState{
		guidMap: make(map[string]MissionEntry),
		active:  make(map[string]ActiveMission),
	}
}

func (s *WatcherState) RecordMarker(guid, generator, contract, contractDefinitionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.guidMap[guid]; !exists {
		s.guidMap[guid] = MissionEntry{
			DebugName:            contract,
			Generator:            generator,
			ContractDefinitionID: contractDefinitionID,
		}
	}
}

func (s *WatcherState) RecordAccepted(guid string, ts time.Time) ActiveMission {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, exists := s.guidMap[guid]
	debugName := "Unknown"
	generator := "Unknown"
	defID := ""
	if exists {
		debugName = entry.DebugName
		generator = entry.Generator
		defID = entry.ContractDefinitionID
	}
	active := ActiveMission{
		GUID:                 guid,
		DebugName:            debugName,
		Generator:            generator,
		StartTS:              ts,
		ContractDefinitionID: defID,
	}
	s.active[guid] = active
	s.recentLifecycle = append(s.recentLifecycle, MissionLifecycleEvent{
		Trigger:              "accept",
		GUID:                 guid,
		DebugName:            debugName,
		TS:                   ts,
		ContractDefinitionID: defID,
	})
	if len(s.recentLifecycle) > 32 {
		s.recentLifecycle = s.recentLifecycle[1:]
	}
	return active
}

func (s *WatcherState) RecordEnd(guid, completion string, ts time.Time) (ActiveMission, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	active, exists := s.active[guid]
	delete(s.active, guid)

	entry, entryExists := s.guidMap[guid]
	debugName := "Unknown"
	defID := ""
	if exists {
		debugName = active.DebugName
		defID = active.ContractDefinitionID
	} else if entryExists {
		debugName = entry.DebugName
		defID = entry.ContractDefinitionID
	}

	if completion == "Complete" {
		s.recentLifecycle = append(s.recentLifecycle, MissionLifecycleEvent{
			Trigger:              "complete",
			GUID:                 guid,
			DebugName:            debugName,
			TS:                   ts,
			ContractDefinitionID: defID,
		})
		if len(s.recentLifecycle) > 32 {
			s.recentLifecycle = s.recentLifecycle[1:]
		}
	}
	return active, exists
}

func (s *WatcherState) ClearAllActive() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.active = make(map[string]ActiveMission)
}

func (s *WatcherState) CorrelateBlueprint(ts time.Time) (MissionLifecycleEvent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var best MissionLifecycleEvent
	hasBest := false
	var bestDelta float64 = 6.0

	for _, e := range s.recentLifecycle {
		delta := ts.Sub(e.TS).Seconds()
		if delta >= 0.0 && delta <= 5.0 && delta < bestDelta {
			best = e
			hasBest = true
			bestDelta = delta
		}
	}
	return best, hasBest
}

func parseLogTimestamp(line string) time.Time {
	m := patternTimestamp.FindStringSubmatch(line)
	if len(m) < 2 {
		return time.Time{}
	}
	raw := m[1]
	// ISO 8601 parsing variations
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err == nil {
		return t
	}
	t, err = time.Parse("2006-01-02T15:04:05.999999999", raw)
	if err == nil {
		return t
	}
	return time.Time{}
}

func applyWatchLineToState(line string, state *WatcherState, session *SessionTracker, ts time.Time) {
	if session != nil {
		session.ProcessLine(line, ts, state)
	}
	if m := patternMarker.FindStringSubmatch(line); len(m) >= 4 {
		defID := ""
		if dm := patternMarkerDefID.FindStringSubmatch(line); len(dm) >= 2 {
			defID = dm[1]
		}
		state.RecordMarker(m[1], m[2], m[3], defID)
	} else if m := patternAccepted.FindStringSubmatch(line); len(m) >= 2 {
		state.RecordAccepted(m[1], ts)
	} else if m := patternEndMission.FindStringSubmatch(line); len(m) >= 4 {
		state.RecordEnd(m[1], m[2], ts)
	}
}

// reconcileActiveMissionsFromLog replays Game.log to find missions still active (accepted, not ended).
func reconcileActiveMissionsFromLog(path string, state *WatcherState, session *SessionTracker) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	state.mu.Lock()
	state.active = make(map[string]ActiveMission)
	state.guidMap = make(map[string]MissionEntry)
	state.recentLifecycle = nil
	state.mu.Unlock()

	if session == nil {
		session = NewSessionTracker()
	} else {
		session.Reset()
	}

	scanner := bufio.NewScanner(file)
	buf := make([]byte, 0, 1024*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), "\r")
		if line == "" {
			continue
		}
		ts := session.ResolveTimestamp(line)
		applyWatchLineToState(line, state, session, ts)
	}
	if session != nil {
		session.FinalizeAfterReconcile(state, time.Now())
	}
	return scanner.Err()
}

func postGameSessionEvent(url, apiKey, eventType string) {
	if eventType == "" {
		return
	}
	label := eventType
	switch eventType {
	case "game_exit_menu":
		label = "Quit to menu"
	case "game_quit":
		label = "Game closed"
	case "game_crash":
		label = "Game crash detected"
	case "game_reconnected":
		label = "Back online in PU"
	case "game_tracking":
		label = "Resumed normal tracking"
	}
	if err := postDumperEvent(url, apiKey, eventType, nil); err != nil {
		fmt.Printf("  [Live] %s✗ Game status sync failed (%s):%s %v\n", color.Red, label, color.Reset, err)
	} else {
		fmt.Printf("  [Live] %sGame status:%s %s\n", color.Cyan, color.Reset, label)
	}
}

func syncActiveMissionsToServer(url, apiKey string, state *WatcherState) {
	state.mu.Lock()
	snapshot := make([]ActiveMission, 0, len(state.active))
	for _, mission := range state.active {
		snapshot = append(snapshot, mission)
	}
	state.mu.Unlock()

	for _, active := range snapshot {
		fields := map[string]string{
			"missionGuid":            active.GUID,
			"contractDefinitionId": active.ContractDefinitionID,
			"debugName":              active.DebugName,
		}
		if err := postDumperEvent(url, apiKey, "mission_started", fields); err != nil {
			fmt.Printf("  [Live] %s✗ Mission sync failed:%s %v\n", color.Red, color.Reset, err)
		}
	}
	if len(snapshot) > 0 {
		fmt.Printf("%sSynced %d active mission(s) already in Game.log%s\n", color.Cyan, len(snapshot), color.Reset)
	}
}

func parseBlueprintsFromLog(path string, state *WatcherState) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var discovered []string
	filename := filepath.Base(path)
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		ts := parseLogTimestamp(line)
		if ts.IsZero() {
			ts = time.Now()
		}

		if m := patternMarker.FindStringSubmatch(line); len(m) >= 4 {
			defID := ""
			if dm := patternMarkerDefID.FindStringSubmatch(line); len(dm) >= 2 {
				defID = dm[1]
			}
			state.RecordMarker(m[1], m[2], m[3], defID)

		} else if m := patternAccepted.FindStringSubmatch(line); len(m) >= 2 {
			active := state.RecordAccepted(m[1], ts)
			tsStr := ts.Format("2006-01-02 15:04:05")
			fmt.Printf("  [%s] [%s] %sMission started: %s (%s)%s\n",
				tsStr, filename, color.Green, active.DebugName, active.GUID, color.Reset)

		} else if m := patternEndMission.FindStringSubmatch(line); len(m) >= 4 {
			guid, completion, reason := m[1], m[2], m[3]
			active, exists := state.RecordEnd(guid, completion, ts)
			entry, entryExists := state.guidMap[guid]
			debugName := "Unknown"
			if exists {
				debugName = active.DebugName
			} else if entryExists {
				debugName = entry.DebugName
			}
			tsStr := ts.Format("2006-01-02 15:04:05")

			switch completion {
			case "Complete":
				fmt.Printf("  [%s] [%s] %sMission complete: %s (%s) [%s]%s\n",
					tsStr, filename, color.Cyan, debugName, guid, reason, color.Reset)
			case "Abandon":
				fmt.Printf("  [%s] [%s] %sMission abandoned: %s (%s) [%s]%s\n",
					tsStr, filename, color.Red, debugName, guid, reason, color.Reset)
			case "Fail":
				fmt.Printf("  [%s] [%s] %sMission failed: %s (%s) [%s]%s\n",
					tsStr, filename, color.Yellow, debugName, guid, reason, color.Reset)
			default:
				fmt.Printf("  [%s] [%s] %sMission ended (%s): %s (%s) [%s]%s\n",
					tsStr, filename, color.Yellow, completion, debugName, guid, reason, color.Reset)
			}

		} else if m := patternBlueprint.FindStringSubmatch(line); len(m) >= 2 {
			productName := strings.TrimSpace(m[1])
			tsStr := ts.Format("2006-01-02 15:04:05")
			corr, found := state.CorrelateBlueprint(ts)
			if found {
				fmt.Printf("  [%s] [%s] %sBlueprint received: %s%s%s (from %s on %s)%s\n",
					tsStr, filename, color.Magenta, color.Green, productName, color.Magenta, corr.DebugName, corr.Trigger, color.Reset)
			} else {
				fmt.Printf("  [%s] [%s] %sBlueprint received: %s%s%s (no recent mission to correlate)%s\n",
					tsStr, filename, color.Magenta, color.Green, productName, color.Magenta, color.Reset)
			}

			discovered = append(discovered, productName)
		}
	}
	return discovered, scanner.Err()
}

func loadEnvFile(path string) map[string]string {
	env := make(map[string]string)
	file, err := os.Open(path)
	if err != nil {
		return env
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, `"'`)
			env[key] = val
		}
	}
	return env
}

func saveEnvFile(path string, variables map[string]string) {
	file, err := os.Create(path)
	if err != nil {
		return
	}
	defer file.Close()

	writer := bufio.NewWriter(file)
	writer.WriteString("# Saved Configuration Settings\n")
	for k, v := range variables {
		if v != "" {
			v = strings.Trim(v, `"'`)
			writer.WriteString(fmt.Sprintf("%s=%s\n", k, v))
		}
	}
	writer.Flush()
}

func loadCacheFile(path string) map[string]bool {
	cache := make(map[string]bool)
	file, err := os.ReadFile(path)
	if err != nil {
		return cache
	}
	var list []string
	if err := json.Unmarshal(file, &list); err == nil {
		for _, item := range list {
			cache[item] = true
		}
	}
	return cache
}

func saveCacheFile(path string, cache map[string]bool) {
	list := make([]string, 0, len(cache))
	for k := range cache {
		list = append(list, k)
	}
	sort.Strings(list)
	data, err := json.MarshalIndent(list, "", "  ")
	if err == nil {
		os.WriteFile(path, data, 0644)
	}
}

var DumperVersion = "1.4.3"
var MinGameVersion = "4.8"

const DefaultWebhookURL = "https://dcyugmcvlmhlfmillzma.supabase.co/functions/v1/log-watcher-webhook"
const DefaultReleasesURL = "https://github.com/Sinedrone-Sentinel/dumpers_repo/releases"

// Helpers for folder scans
var scanSkipDirs = map[string]bool{
	"windows": true, "windows.old": true, "winsxs": true,
	"$recycle.bin": true, "$winreagent": true, "$sysreset": true, "$getcurrent": true,
	"system volume information": true, "config.msi": true, "recovery": true, "boot": true,
	"programdata": true, "appdata": true, "perflogs": true, "onedrivetemp": true,
	"node_modules": true, ".git": true, ".svn": true, ".hg": true,
}

func isChannelDir(path string) bool {
	name := strings.ToUpper(filepath.Base(path))
	if name == "LIVE" || name == "PTU" || name == "EPTU" || name == "HOTFIX" || name == "TECH-PREVIEW" {
		return true
	}
	_, err := os.Stat(filepath.Join(path, "build_manifest.id"))
	return err == nil
}

func looksLikeSCRoot(path string) bool {
	entries, err := os.ReadDir(path)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.IsDir() && isChannelDir(filepath.Join(path, entry.Name())) {
			return true
		}
	}
	return false
}

func findSCRoots(driveRoot string) []string {
	var roots []string
	type queueItem struct {
		path  string
		depth int
	}
	queue := []queueItem{{path: driveRoot, depth: 0}}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		entries, err := os.ReadDir(current.path)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			nameLower := strings.ToLower(entry.Name())
			if scanSkipDirs[nameLower] {
				continue
			}

			entryPath := filepath.Join(current.path, entry.Name())
			if (nameLower == "starcitizen" || nameLower == "star citizen") && looksLikeSCRoot(entryPath) {
				roots = append(roots, entryPath)
				continue
			}

			if current.depth+1 < 4 {
				queue = append(queue, queueItem{path: entryPath, depth: current.depth + 1})
			}
		}
	}
	return roots
}

func isBlueprintAcquired(acquired map[string]bool, input string) bool {
	key := cacheKeyForInput(input)
	return acquired[key] || acquired[input]
}

func postBlueprintEvent(url, apiKey, blueprintInput, contractDefID string) (httpStatus int, duplicate bool, internalName string, err error) {
	postValue := blueprintInput
	resolved := resolveBlueprintInput(blueprintInput, contractDefID)
	if resolved.OK {
		postValue = resolved.InternalName
	}

	payload := map[string]string{
		"type":      "blueprint_received",
		"blueprint": postValue,
	}
	if contractDefID != "" {
		payload["contractDefinitionId"] = contractDefID
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return 0, false, "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return 0, false, "", err
	}
	defer res.Body.Close()

	var resJSON map[string]interface{}
	_ = json.NewDecoder(res.Body).Decode(&resJSON)

	internalName = ""
	if bp, ok := resJSON["blueprint"].(string); ok {
		internalName = bp
	} else if resolved.OK {
		internalName = resolved.InternalName
	}
	isDupe := false
	if d, ok := resJSON["duplicate"].(bool); ok {
		isDupe = d
	}
	if res.StatusCode == 400 {
		if errMsg, ok := resJSON["error"].(string); ok && errMsg != "" {
			return res.StatusCode, isDupe, internalName, fmt.Errorf("%s (posted: %q)", errMsg, postValue)
		}
	}
	return res.StatusCode, isDupe, internalName, nil
}

func postDumperEvent(url, apiKey, eventType string, fields map[string]string) error {
	payload := map[string]string{"type": eventType}
	for k, v := range fields {
		if v != "" {
			payload[k] = v
		}
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		return fmt.Errorf("HTTP %d", res.StatusCode)
	}
	return nil
}

func startSessionPingLoop(url, apiKey string, stop <-chan struct{}) {
	ticker := time.NewTicker(90 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			if err := postDumperEvent(url, apiKey, "session_ping", nil); err != nil {
				fmt.Printf("  [Live] %s⚠ Session ping failed:%s %v\n", color.Yellow, color.Reset, err)
			}
		}
	}
}

func scanDirectoryConcurrently(dirPath string, minimumVersion string) ([]string, error) {
	files, err := filepath.Glob(filepath.Join(dirPath, "*.log"))
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no .log files found in directory: %s", dirPath)
	}

	// Merge local translations if any
	localLocMap := parseLocalLocalization(dirPath)
	if len(localLocMap) == 0 {
		localLocMap = parseLocalLocalization(filepath.Dir(dirPath))
	}
	if len(localLocMap) > 0 {
		registerCustomTranslations(localLocMap)
		fmt.Printf("%sLoaded %d custom translations from local global.ini (StarStrings/localization mod active)%s\n", color.Green, len(localLocMap), color.Reset)
	}

	fmt.Printf("Scanning %d log file(s) in %s (Multithreaded)...\n", len(files), filepath.Base(dirPath))

	var wg sync.WaitGroup
	resultsChan := make(chan []string, len(files))
	state := NewWatcherState()

	for i, f := range files {
		wg.Add(1)
		go func(idx int, path string) {
			defer wg.Done()
			if !isLogVersionAllowed(path, minimumVersion) {
				fmt.Printf("  [%3d/%d] Skipping %s (game version is below minimum %s)\n", idx+1, len(files), filepath.Base(path), minimumVersion)
				resultsChan <- nil
				return
			}
			info, err := os.Stat(path)
			if err != nil {
				resultsChan <- nil
				return
			}
			sizeMB := float64(info.Size()) / (1024 * 1024)
			fmt.Printf("  [%3d/%d] Scanning %s (%.2f MB)...\n", idx+1, len(files), filepath.Base(path), sizeMB)
			bps, _ := parseBlueprintsFromLog(path, state)
			resultsChan <- bps
		}(i, f)
	}

	wg.Wait()
	close(resultsChan)

	var allBps []string
	for bps := range resultsChan {
		if bps != nil {
			allBps = append(allBps, bps...)
		}
	}
	return allBps, nil
}

func normalizePath(path string) string {
	if path == "" {
		return ""
	}
	if runtime.GOOS == "windows" {
		// Convert WSL paths /mnt/x/ to X:\
		if len(path) >= 7 && strings.HasPrefix(path, "/mnt/") && path[6] == '/' {
			drive := strings.ToUpper(string(path[5]))
			remaining := path[7:]
			remaining = strings.ReplaceAll(remaining, "/", "\\")
			return drive + ":\\" + remaining
		}
		// Convert / to \ for all paths on Windows
		return filepath.Clean(strings.ReplaceAll(path, "/", "\\"))
	}
	return path
}

func isLogVersionAllowed(path string, minimumVersion string) bool {
	if minimumVersion == "" {
		return true
	}
	parts := strings.Split(minimumVersion, ".")
	if len(parts) == 0 {
		return true
	}
	minMajor, _ := strconv.Atoi(parts[0])
	minMinor := 0
	if len(parts) > 1 {
		minMinor, _ = strconv.Atoi(parts[1])
	}

	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	lineCount := 0
	for scanner.Scan() && lineCount < 150 {
		lineCount++
		line := scanner.Text()
		idx := strings.Index(strings.ToLower(line), "product version:")
		if idx != -1 {
			versionPart := strings.TrimSpace(line[idx+16:])
			versionPart = strings.TrimLeft(versionPart, " \t-=:")
			vParts := strings.Split(versionPart, ".")
			if len(vParts) > 0 {
				major, _ := strconv.Atoi(vParts[0])
				minor := 0
				if len(vParts) > 1 {
					minorStr := vParts[1]
					if dashIdx := strings.Index(minorStr, "-"); dashIdx != -1 {
						minorStr = minorStr[:dashIdx]
					}
					minor, _ = strconv.Atoi(minorStr)
				}
				if major > minMajor || (major == minMajor && minor >= minMinor) {
					return true
				}
				return false
			}
		}
	}
	return true
}

func parseLocalLocalization(channelDir string) map[string][]string {
	localMap := make(map[string][]string)
	locDir := filepath.Join(channelDir, "data", "Localization")
	if info, err := os.Stat(locDir); err != nil || !info.IsDir() {
		return localMap
	}

	filepath.Walk(locDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && strings.ToLower(info.Name()) == "global.ini" {
			file, err := os.Open(path)
			if err != nil {
				return nil
			}
			defer file.Close()

			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
					continue
				}
				parts := strings.SplitN(line, "=", 2)
				if len(parts) != 2 {
					continue
				}
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				val = strings.Trim(val, `"'`)
				if key == "" || val == "" {
					continue
				}

				internalName := ""
				if strings.HasPrefix(key, "item_Name_") {
					internalName = strings.TrimPrefix(key, "item_Name_")
				} else if strings.HasPrefix(key, "item_Name") {
					internalName = strings.TrimPrefix(key, "item_Name")
				} else if strings.HasSuffix(key, "_Name") {
					internalName = strings.TrimSuffix(key, "_Name")
				}

				if internalName != "" {
					internalName = canonicalInternalKey(internalName)
					valLower := strings.ToLower(val)
					// Avoid duplicates
					exists := false
					for _, existing := range localMap[valLower] {
						if existing == internalName {
							exists = true
							break
						}
					}
					if !exists {
						localMap[valLower] = append(localMap[valLower], internalName)
					}
				}
			}
		}
		return nil
	})
	return localMap
}

func main() {
	enableWindowsANSI()
	if !isTTY() {
		disableColors()
	}

	var (
		filePath   string
		url        string
		apiKey     string
		dryRun     bool
		watch      bool
		noWatch    bool
		logDir     string
		configure  bool
	)

	flag.StringVar(&filePath, "file", "", "Path to the JSON file or log file to parse.")
	flag.StringVar(&filePath, "f", "", "Path to the JSON file or log file to parse (shorthand).")

	flag.StringVar(&url, "url", "", "Override Supabase webhook URL (optional; built-in default is used).")
	flag.StringVar(&url, "u", "", "Override Supabase webhook URL (shorthand).")

	flag.StringVar(&apiKey, "key", "", "Your secret API key.")
	flag.StringVar(&apiKey, "k", "", "Your secret API key (shorthand).")

	flag.BoolVar(&dryRun, "dry-run", false, "Dry run: scan blueprints locally without making API calls.")
	flag.BoolVar(&dryRun, "d", false, "Dry run (shorthand).")

	flag.BoolVar(&watch, "watch", true, "Watch mode: trails a Game.log file in real-time (default: on).")
	flag.BoolVar(&watch, "w", true, "Watch mode (shorthand).")
	flag.BoolVar(&noWatch, "no-watch", false, "Disable watch mode (batch import only).")

	flag.StringVar(&logDir, "log-dir", "", "Directly scan a specific directory for log files.")
	flag.StringVar(&logDir, "l", "", "Directly scan a specific directory for log files (shorthand).")

	flag.BoolVar(&configure, "configure", false, "Force running the configuration wizard.")
	flag.BoolVar(&configure, "c", false, "Force running the configuration wizard (shorthand).")

	// Support positional file path (standard parsing behavior)
	flag.Parse()

	// If filePath wasn't set by flags, check first positional arg
	if filePath == "" && len(flag.Args()) > 0 {
		filePath = flag.Arg(0)
		// Check if we captured -w, -d, or -c as a trailing positional arg because Go flag package stops parsing on positional args
		for _, arg := range flag.Args() {
			if arg == "-w" || arg == "--watch" {
				watch = true
			}
			if arg == "-no-watch" || arg == "--no-watch" {
				noWatch = true
			}
			if arg == "-d" || arg == "--dry-run" {
				dryRun = true
			}
			if arg == "-c" || arg == "--configure" {
				configure = true
			}
		}
	}

	// Normalize paths immediately
	filePath = normalizePath(filePath)
	logDir = normalizePath(logDir)

	// Determine environment paths
	exePath, err := os.Executable()
	baseDir := "."
	if err == nil {
		baseDir = filepath.Dir(exePath)
	}
	envPath := filepath.Join(baseDir, ".env")
	envVars := loadEnvFile(envPath)

	// Resolve watch mode: default on; --no-watch or WATCH_MODE=false disables
	if noWatch {
		watch = false
	} else if watch {
		if envVars["WATCH_MODE"] == "false" {
			watch = false
		}
	}

	isInteractive := configure || (isTTY() && !dryRun && (
		apiKey == "" && os.Getenv("LOG_WATCHER_API_KEY") == "" && envVars["LOG_WATCHER_API_KEY"] == ""))

	if isInteractive {
		fmt.Printf("%s====================================================%s\n", color.Cyan, color.Reset)
		fmt.Printf("%s             BP Dumper Configuration Wizard%s\n", color.Cyan, color.Reset)
		fmt.Printf("%s====================================================%s\n\n", color.Cyan, color.Reset)

		reader := bufio.NewReader(os.Stdin)

		// 1. Path Prompt
		defaultPath := envVars["LOG_PATH"]
		pathPrompt := "Enter path to JSON export or folder (Leave empty to auto-detect SC logs)"
		if defaultPath != "" {
			pathPrompt += fmt.Sprintf(" [%s]", defaultPath)
		}
		fmt.Print(pathPrompt + ": ")
		userPath, _ := reader.ReadString('\n')
		userPath = strings.TrimSpace(userPath)
		userPath = strings.Trim(userPath, `"'`)
		if userPath == "" && defaultPath != "" {
			userPath = defaultPath
		}
		if userPath == "" {
			fmt.Printf("%sScanning local system for Star Citizen installations...%s\n", color.Dim, color.Reset)
			installs := detectSCInstalls()
			if len(installs) > 0 {
				chosenChannel := "LIVE"
				if _, ok := installs["LIVE"]; !ok {
					for k := range installs {
						chosenChannel = k
						break
					}
				}
				detectedDir := installs[chosenChannel]
				fmt.Printf("%sDetected channel %s at: %s%s\n", color.Green, chosenChannel, detectedDir, color.Reset)
				userPath = detectedDir
			} else {
				fallback := DefaultWinPath
				if info, err := os.Stat(fallback); err == nil && info.IsDir() {
					liveDir := filepath.Join(fallback, "LIVE")
					if info2, err2 := os.Stat(liveDir); err2 == nil && info2.IsDir() {
						fmt.Printf("%sDetected default fallback at: %s%s\n", color.Green, liveDir, color.Reset)
						userPath = liveDir
					}
				}
			}
		}
		if userPath != "" {
			filePath = userPath
		}

		// 2. Dry Run Prompt
		fmt.Print("Dry run only? (Y/N, Enter = N): ")
		userDryRun, _ := reader.ReadString('\n')
		userDryRun = strings.ToLower(strings.TrimSpace(userDryRun))
		if userDryRun == "y" {
			dryRun = true
		}

		// 3. Watch Mode Prompt
		watch = true
		fmt.Print("Watch mode (trail log file in real-time)? (Y/N, Enter = Y): ")
		userWatch, _ := reader.ReadString('\n')
		userWatch = strings.ToLower(strings.TrimSpace(userWatch))
		if userWatch == "n" {
			watch = false
		}

		// 4. Key Prompt
		if !dryRun {
			defaultKey := envVars["LOG_WATCHER_API_KEY"]
			keyPrompt := "Enter your BP Dumper API key from Settings (e.g. dr_...)"
			if defaultKey != "" {
				maskedKey := defaultKey
				if len(defaultKey) > 10 {
					maskedKey = defaultKey[:6] + "..." + defaultKey[len(defaultKey)-4:]
				}
				keyPrompt += fmt.Sprintf(" [%s]", maskedKey)
			}
			fmt.Print(keyPrompt + ": ")
			userKey, _ := reader.ReadString('\n')
			userKey = strings.TrimSpace(userKey)
			userKey = strings.Trim(userKey, `"'`)
			if userKey == "" && defaultKey != "" {
				userKey = defaultKey
			}
			apiKey = userKey
		}

		// 6. Import Old Logs Prompt
		fmt.Print("Import old logs on first run? (Y/N, Enter = Y): ")
		userImportOld, _ := reader.ReadString('\n')
		userImportOld = strings.ToLower(strings.TrimSpace(userImportOld))
		importOldLogs := "true"
		if userImportOld == "n" {
			importOldLogs = "false"
		}

		fmt.Println()

		if !dryRun && url == "" {
			url = DefaultWebhookURL
		}

		// Save configuration immediately
		saveVars := map[string]string{
			"LOG_PATH":             filePath,
			"SUPABASE_WEBHOOK_URL": url,
			"LOG_WATCHER_API_KEY":  apiKey,
			"IMPORT_OLD_LOGS":      importOldLogs,
			"WATCH_MODE":           fmt.Sprintf("%t", watch),
		}
		saveEnvFile(envPath, saveVars)
	}

	// Resolve config variables from env if not set in interactive wizard or CLI flags
	if url == "" {
		url = os.Getenv("SUPABASE_WEBHOOK_URL")
		if url == "" {
			url = envVars["SUPABASE_WEBHOOK_URL"]
		}
		if url == "" {
			url = DefaultWebhookURL
		}
	}

	if apiKey == "" {
		apiKey = os.Getenv("LOG_WATCHER_API_KEY")
		if apiKey == "" {
			apiKey = envVars["LOG_WATCHER_API_KEY"]
		}
	}

	// Validate config if not dry run
	if !dryRun {
		if url == "" {
			url = DefaultWebhookURL
		}
		if apiKey == "" {
			fmt.Printf("%sError: API key must be provided via --key, LOG_WATCHER_API_KEY environment variable, or configured in .env file.%s\n", color.Red, color.Reset)
			os.Exit(1)
		}
	}

	// Cache file setup
	cachePath := filepath.Join(baseDir, ".dumper_cache.json")
	acquiredBlueprints := loadCacheFile(cachePath)

	// Fetch current server state if not dry-run
	if !dryRun {
		fmt.Printf("%sSynchronizing blueprints list from server...%s\n", color.Dim, color.Reset)
		req, err := http.NewRequest("GET", url, nil)
		if err == nil {
			req.Header.Set("Authorization", "Bearer "+apiKey)
			client := &http.Client{Timeout: 15 * time.Second}
			res, err := client.Do(req)
			if err == nil && res.StatusCode == 200 {
				var resJSON struct {
					Success             bool     `json:"success"`
					Blueprints          []string `json:"blueprints"`
					LatestDumperVersion string   `json:"latestDumperVersion"`
				}
				if err := json.NewDecoder(res.Body).Decode(&resJSON); err == nil && resJSON.Success {
					for _, bp := range resJSON.Blueprints {
						acquiredBlueprints[bp] = true
					}
					saveCacheFile(cachePath, acquiredBlueprints)
					fmt.Printf("Synced %d blueprints from account.\n", len(resJSON.Blueprints))

					if resJSON.LatestDumperVersion != "" && resJSON.LatestDumperVersion != DumperVersion {
						fmt.Printf("%s[Update] New dumper version available: %s (You have %s).%s\n",
							color.Yellow, resJSON.LatestDumperVersion, DumperVersion, color.Reset)
						fmt.Printf("%sDownload the latest release from: %s%s\n\n",
							color.Yellow, DefaultReleasesURL, color.Reset)
					}
				}
				res.Body.Close()
			}
		}
	}

	// First run: Import old logs from backup paths if specified (runs before watch mode)
	didImportOldLogs := false
	if envVars["IMPORT_OLD_LOGS"] == "true" {
		didImportOldLogs = true
		fmt.Printf("\n%s[First Run] Scanning historical logs in backup folder...%s\n", color.Cyan, color.Reset)
		var oldLogDirs []string
		if logDir != "" {
			oldLogDirs = []string{logDir}
		} else {
			// Find channel/logbackups
			var cp string
			if filePath != "" {
				info, err := os.Stat(filePath)
				if err == nil {
					if info.IsDir() {
						cp = filePath
					} else {
						cp = filepath.Dir(filePath)
					}
				}
			}
			if cp == "" {
				cp = envVars["BACKUP_PATH"]
				if cp != "" {
					cp = filepath.Dir(cp)
				}
			}
			if cp == "" {
				installs := detectSCInstalls()
				if len(installs) > 0 {
					chosenChannel := "LIVE"
					if _, ok := installs["LIVE"]; !ok {
						for k := range installs {
							chosenChannel = k
							break
						}
					}
					cp = installs[chosenChannel]
				} else {
					fallback := DefaultWinPath
					if info, err := os.Stat(fallback); err == nil && info.IsDir() {
						cp = filepath.Join(fallback, "LIVE")
					}
				}
			}

			if cp != "" {
				oldLogDirs = []string{cp, filepath.Join(cp, "logbackups")}
			}
		}

		if len(oldLogDirs) > 0 {
			var filesToScan []string
			for _, d := range oldLogDirs {
				matches, _ := filepath.Glob(filepath.Join(d, "*.log"))
				// Exclude active Game.log to avoid locked files or watch overlap
				for _, match := range matches {
					if filepath.Base(match) != "Game.log" {
						filesToScan = append(filesToScan, match)
					}
				}
			}

			if len(filesToScan) > 0 {
				fmt.Printf("Scanning %d historical log file(s)...\n", len(filesToScan))
				// Merge local translations
				for _, d := range oldLogDirs {
					localLocMap := parseLocalLocalization(d)
					if len(localLocMap) > 0 {
						registerCustomTranslations(localLocMap)
					}
				}

				var oldBps []string
				var wg sync.WaitGroup
				resultsChan := make(chan []string, len(filesToScan))
				state := NewWatcherState()

				for idx, path := range filesToScan {
					wg.Add(1)
					go func(i int, p string) {
						defer wg.Done()
						if !isLogVersionAllowed(p, MinGameVersion) {
							fmt.Printf("  [%3d/%d] Skipping %s (game version is below minimum %s)\n", i+1, len(filesToScan), filepath.Base(p), MinGameVersion)
							resultsChan <- nil
							return
						}
						bps, _ := parseBlueprintsFromLog(p, state)
						resultsChan <- bps
					}(idx, path)
				}
				wg.Wait()
				close(resultsChan)
				for bps := range resultsChan {
					oldBps = append(oldBps, bps...)
				}

				bpMap := make(map[string]bool)
				for _, bp := range oldBps {
					bpMap[bp] = true
				}
				var uniqueOld []string
				for k := range bpMap {
					uniqueOld = append(uniqueOld, k)
				}

				if len(uniqueOld) > 0 {
					var toSend []string
					for _, rawName := range uniqueOld {
						if !isBlueprintAcquired(acquiredBlueprints, rawName) {
							toSend = append(toSend, rawName)
						}
					}

					if len(toSend) > 0 {
						fmt.Printf("Uploading %d historical blueprints...\n", len(toSend))
						successCount := 0
						dupeCount := 0
						failCount := 0
						for idx, bpID := range toSend {
							if dryRun {
								successCount++
								resolved := resolveBlueprintInput(bpID, "")
								label := bpID
								if resolved.OK {
									label = fmt.Sprintf("%s → %s", resolved.BlueprintName, resolved.InternalName)
								} else if resolved.Error == "ambiguous_blueprint" {
									label = fmt.Sprintf("%s (ambiguous — would notify)", bpID)
								}
								fmt.Printf("  [%d/%d] %s★ Would Import:%s %s\n", idx+1, len(toSend), color.Green, color.Reset, label)
							} else {
								status, isDupe, internalName, err := postBlueprintEvent(url, apiKey, bpID, "")
								if err != nil {
									failCount++
									fmt.Printf("  [%d/%d] %s✗ Connection Error:%s %s (%v)\n", idx+1, len(toSend), color.Red, color.Reset, bpID, err)
									continue
								}
								if status == 200 {
									if isDupe {
										dupeCount++
										fmt.Printf("  [%d/%d] %s↻ Already Acquired:%s %s\n", idx+1, len(toSend), color.Yellow, color.Reset, bpID)
									} else {
										successCount++
										fmt.Printf("  [%d/%d] %s★ Successfully Imported:%s %s\n", idx+1, len(toSend), color.Green, color.Reset, bpID)
									}
									if internalName != "" {
										acquiredBlueprints[internalName] = true
									}
								} else if status == 202 {
									successCount++
									fmt.Printf("  [%d/%d] %s⚠ Notification sent — mark manually:%s %s\n", idx+1, len(toSend), color.Yellow, color.Reset, bpID)
								} else if status == 400 {
									failCount++
									fmt.Printf("  [%d/%d] %s✗ Unknown blueprint:%s %s\n", idx+1, len(toSend), color.Red, color.Reset, bpID)
								} else {
									failCount++
									fmt.Printf("  [%d/%d] %s✗ Failed:%s %s (HTTP %d)\n", idx+1, len(toSend), color.Red, color.Reset, bpID, status)
								}
							}
						}
						fmt.Printf("\nImport complete: %s%d successfully imported%s, %s%d already acquired%s, %s%d failed%s\n",
							color.Green, successCount, color.Reset,
							color.Yellow, dupeCount, color.Reset,
							color.Red, failCount, color.Reset,
						)
						saveCacheFile(cachePath, acquiredBlueprints)
					} else {
						fmt.Println("All historical blueprints already acquired.")
					}
				} else {
					fmt.Println("No blueprints found in historical logs.")
				}
			} else {
				fmt.Println("No historical logs to scan.")
			}
		}

		// Save disabled state
		envVars["IMPORT_OLD_LOGS"] = "false"
		saveEnvFile(envPath, envVars)
		fmt.Printf("%s[First Run] Historical import complete. Disabling future auto-imports.%s\n\n", color.Green, color.Reset)
	}

	// Watch Mode Routing (after optional historical import)
	if watch {
		if didImportOldLogs {
			fmt.Printf("%s[Watch Mode] Historical import finished. Tailing Game.log for new blueprints...%s\n\n", color.Cyan, color.Reset)
		}
		watchFile := ""
		if filePath != "" {
			info, err := os.Stat(filePath)
			if err == nil {
				if info.IsDir() {
					watchFile = filepath.Join(filePath, "Game.log")
				} else {
					watchFile = filePath
				}
			}
		} else {
			if logDir != "" {
				watchFile = filepath.Join(logDir, "Game.log")
			} else {
				// Try auto detect
				installs := detectSCInstalls()
				if len(installs) > 0 {
					chosenChannel := "LIVE"
					if _, ok := installs["LIVE"]; !ok {
						for k := range installs {
							chosenChannel = k
							break
						}
					}
					watchFile = filepath.Join(installs[chosenChannel], "Game.log")
				} else {
					// standard path fallback
					if info, err := os.Stat(DefaultWinPath); err == nil && info.IsDir() {
						watchFile = filepath.Join(DefaultWinPath, "LIVE", "Game.log")
					}
				}
			}
		}

		if watchFile == "" {
			fmt.Printf("%sError: Could not resolve a valid Game.log for watch mode.%s\n", color.Red, color.Reset)
			fmt.Println("Please specify the path directly (e.g. ./bp-dumper --watch /path/to/Game.log)")
			os.Exit(1)
		}

		// Load local translations if any
		channelDir := filepath.Dir(watchFile)
		localLocMap := parseLocalLocalization(channelDir)
		if len(localLocMap) > 0 {
			registerCustomTranslations(localLocMap)
			fmt.Printf("%sLoaded %d custom translations from local global.ini (StarStrings/localization mod active)%s\n", color.Green, len(localLocMap), color.Reset)
		}

		state := NewWatcherState()
		watchLogFile(watchFile, state, acquiredBlueprints, dryRun, url, apiKey)
		return
	}

	// Standard batch-import mode
	var uniqueBlueprints []string
	sourceName := ""

	if filePath != "" {
		info, err := os.Stat(filePath)
		if err != nil {
			fmt.Printf("%sError: Path not found: %s%s\n", color.Red, filePath, color.Reset)
			os.Exit(1)
		}

		if !info.IsDir() {
			if strings.HasSuffix(strings.ToLower(filePath), ".json") {
				// JSON Import mode
				jsonData, err := os.ReadFile(filePath)
				if err != nil {
					fmt.Printf("%sError reading JSON: %v%s\n", color.Red, err, color.Reset)
					os.Exit(1)
				}
				var export JSONExport
				if err := json.Unmarshal(jsonData, &export); err != nil {
					fmt.Printf("%sError parsing JSON: %v%s\n", color.Red, err, color.Reset)
					os.Exit(1)
				}

				bpMap := make(map[string]bool)
				for _, bp := range export.Blueprints {
					if bp.ProductName != "" {
						bpMap[bp.ProductName] = true
					}
				}
				for k := range bpMap {
					uniqueBlueprints = append(uniqueBlueprints, k)
				}
				sort.Strings(uniqueBlueprints)
				sourceName = filepath.Base(filePath)
			} else {
				// Direct single log file scan
				if !isLogVersionAllowed(filePath, MinGameVersion) {
					fmt.Printf("Skipping log file %s (game version is below minimum %s)\n", filepath.Base(filePath), MinGameVersion)
					os.Exit(0)
				}
				fmt.Printf("Scanning single log file: %s...\n", filepath.Base(filePath))
				channelDir := filepath.Dir(filePath)
				localLocMap := parseLocalLocalization(channelDir)
				if len(localLocMap) > 0 {
					registerCustomTranslations(localLocMap)
					fmt.Printf("%sLoaded %d custom translations from local global.ini (StarStrings/localization mod active)%s\n", color.Green, len(localLocMap), color.Reset)
				}

				state := NewWatcherState()
				bps, _ := parseBlueprintsFromLog(filePath, state)
				bpMap := make(map[string]bool)
				for _, bp := range bps {
					bpMap[bp] = true
				}
				for k := range bpMap {
					uniqueBlueprints = append(uniqueBlueprints, k)
				}
				sort.Strings(uniqueBlueprints)
				sourceName = filepath.Base(filePath)
			}
		} else {
			// Directory scan
			bps, err := scanDirectoryConcurrently(filePath, MinGameVersion)
			if err != nil {
				fmt.Printf("%sError: %v%s\n", color.Red, err, color.Reset)
				os.Exit(1)
			}
			bpMap := make(map[string]bool)
			for _, bp := range bps {
				bpMap[bp] = true
			}
			for k := range bpMap {
				uniqueBlueprints = append(uniqueBlueprints, k)
			}
			sort.Strings(uniqueBlueprints)
			sourceName = fmt.Sprintf("direct directory scan (%s)", filepath.Base(filePath))
		}
	} else {
		// Auto detect logs
		var logDirs []string
		if logDir != "" {
			logDirs = []string{logDir}
		} else {
			fmt.Printf("%sScanning local system for Star Citizen installations...%s\n", color.Dim, color.Reset)
			installs := detectSCInstalls()
			if len(installs) > 0 {
				fmt.Println("Detected channel installations:")
				for ch, path := range installs {
					fmt.Printf("  - %s: %s\n", ch, path)
				}
				chosenChannel := "LIVE"
				if _, ok := installs["LIVE"]; !ok {
					for k := range installs {
						chosenChannel = k
						break
					}
				}
				channelDir := installs[chosenChannel]
				fmt.Printf("Using channel: %s%s%s (%s)\n", color.Cyan, chosenChannel, color.Reset, channelDir)
				logDirs = []string{channelDir, filepath.Join(channelDir, "logbackups")}
			} else {
				fallback := DefaultWinPath
				if info, err := os.Stat(fallback); err == nil && info.IsDir() {
					liveDir := filepath.Join(fallback, "LIVE")
					if info, err := os.Stat(liveDir); err == nil && info.IsDir() {
						logDirs = []string{liveDir, filepath.Join(liveDir, "logbackups")}
					}
				}
			}
		}

		if len(logDirs) == 0 {
			fmt.Printf("%sError: No Star Citizen installations or log directories detected.%s\n", color.Red, color.Reset)
			fmt.Println("Please specify the path directly (e.g. ./bp-dumper --log-dir /path/to/logbackups)")
			os.Exit(1)
		}

		// Collect all files
		var filesToScan []string
		for _, dir := range logDirs {
			matches, _ := filepath.Glob(filepath.Join(dir, "*.log"))
			filesToScan = append(filesToScan, matches...)
		}

		if len(filesToScan) == 0 {
			fmt.Printf("%sError: No log files found in directories: %v%s\n", color.Red, logDirs, color.Reset)
			os.Exit(1)
		}

		var allBps []string
		var wg sync.WaitGroup
		resultsChan := make(chan []string, len(filesToScan))
		state := NewWatcherState()

		fmt.Printf("Scanning %d log file(s) (Multithreaded)...\n", len(filesToScan))
		for i, path := range filesToScan {
			wg.Add(1)
			go func(idx int, p string) {
				defer wg.Done()
				if !isLogVersionAllowed(p, MinGameVersion) {
					fmt.Printf("  [%3d/%d] Skipping %s (game version is below minimum %s)\n", idx+1, len(filesToScan), filepath.Base(p), MinGameVersion)
					resultsChan <- nil
					return
				}
				info, err := os.Stat(p)
				if err != nil {
					resultsChan <- nil
					return
				}
				sizeMB := float64(info.Size()) / (1024 * 1024)
				fmt.Printf("  [%3d/%d] Scanning %s (%.2f MB)...\n", idx+1, len(filesToScan), filepath.Base(p), sizeMB)
				bps, _ := parseBlueprintsFromLog(p, state)
				resultsChan <- bps
			}(i, path)
		}

		wg.Wait()
		close(resultsChan)

		for bps := range resultsChan {
			if bps != nil {
				allBps = append(allBps, bps...)
			}
		}

		bpMap := make(map[string]bool)
		for _, bp := range allBps {
			bpMap[bp] = true
		}
		for k := range bpMap {
			uniqueBlueprints = append(uniqueBlueprints, k)
		}
		sort.Strings(uniqueBlueprints)
		sourceName = fmt.Sprintf("direct log scan (%d file(s))", len(filesToScan))
	}

	if len(uniqueBlueprints) == 0 {
		fmt.Printf("%sNo blueprints discovered.%s\n", color.Yellow, color.Reset)
		return
	}

	// Filter based on cache
	var toImport []string
	for _, bp := range uniqueBlueprints {
		if !isBlueprintAcquired(acquiredBlueprints, bp) {
			toImport = append(toImport, bp)
		}
	}
	skippedCount := len(uniqueBlueprints) - len(toImport)

	if skippedCount > 0 {
		fmt.Printf("%sSkipped %d blueprint(s) already acquired (cached or server-synced).%s\n", color.Dim, skippedCount, color.Reset)
	}

	if len(toImport) == 0 {
		fmt.Printf("%sAll discovered blueprints are already acquired! Nothing to import.%s\n", color.Green, color.Reset)
		return
	}

	fmt.Printf("%sStarting import of %d unique blueprint(s) from %s...%s\n\n", color.Cyan, len(toImport), sourceName, color.Reset)

	successCount := 0
	dupeCount := 0
	failCount := 0

	for idx, bpID := range toImport {
		if dryRun {
			successCount++
			resolved := resolveBlueprintInput(bpID, "")
			label := bpID
			if resolved.OK {
				label = fmt.Sprintf("%s → %s", resolved.BlueprintName, resolved.InternalName)
			} else if resolved.Error == "ambiguous_blueprint" {
				label = fmt.Sprintf("%s (ambiguous — would notify)", bpID)
			}
			fmt.Printf("  [%d/%d] %s★ Would Import:%s %s\n", idx+1, len(toImport), color.Green, color.Reset, label)
		} else {
			status, isDupe, internalName, err := postBlueprintEvent(url, apiKey, bpID, "")
			if err != nil {
				failCount++
				fmt.Printf("  [%d/%d] %s✗ Connection Error:%s %s (%v)\n", idx+1, len(toImport), color.Red, color.Reset, bpID, err)
				continue
			}
			if status == 200 {
				if isDupe {
					dupeCount++
					fmt.Printf("  [%d/%d] %s↻ Already Acquired:%s %s\n", idx+1, len(toImport), color.Yellow, color.Reset, bpID)
				} else {
					successCount++
					fmt.Printf("  [%d/%d] %s★ Successfully Imported:%s %s\n", idx+1, len(toImport), color.Green, color.Reset, bpID)
				}
				if internalName != "" {
					acquiredBlueprints[internalName] = true
					saveCacheFile(cachePath, acquiredBlueprints)
				}
			} else if status == 202 {
				successCount++
				fmt.Printf("  [%d/%d] %s⚠ Notification sent — mark manually:%s %s\n", idx+1, len(toImport), color.Yellow, color.Reset, bpID)
			} else if status == 400 {
				failCount++
				fmt.Printf("  [%d/%d] %s✗ Unknown blueprint:%s %s\n", idx+1, len(toImport), color.Red, color.Reset, bpID)
			} else {
				failCount++
				fmt.Printf("  [%d/%d] %s✗ Failed:%s %s (HTTP %d)\n", idx+1, len(toImport), color.Red, color.Reset, bpID, status)
			}
		}
	}

	fmt.Println()
	fmt.Printf("%sImport Finished Summary:%s\n", color.Cyan, color.Reset)
	if dryRun {
		fmt.Printf("  %s★ Would Import: %d%s\n", color.Green, successCount, color.Reset)
	} else {
		fmt.Printf("  %s★ Imported:     %d%s\n", color.Green, successCount, color.Reset)
		fmt.Printf("  %s↻ Duplicates:   %d%s\n", color.Yellow, dupeCount, color.Reset)
		if failCount > 0 {
			fmt.Printf("  %s✗ Failed:       %d%s\n", color.Red, failCount, color.Reset)
		} else {
			fmt.Println("  ✗ Failed:       0")
		}
	}
}

type JSONExport struct {
	Blueprints []struct {
		ProductName string `json:"productName"`
	} `json:"blueprints"`
}

func isTTY() bool {
	fileInfo, _ := os.Stdout.Stat()
	return (fileInfo.Mode() & os.ModeCharDevice) != 0
}

func watchLogFile(path string, state *WatcherState, acquiredBps map[string]bool, dryRun bool, url, apiKey string) {
	fmt.Printf("%sWatching %s for live events... (Press Ctrl+C to stop)%s\n", color.Cyan, filepath.Base(path), color.Reset)

	stopPing := make(chan struct{})
	defer close(stopPing)
	sessionTracker := NewSessionTracker()

	if !dryRun && apiKey != "" {
		if err := postDumperEvent(url, apiKey, "session_start", nil); err != nil {
			fmt.Printf("%s⚠ Failed to notify session start:%s %v\n", color.Yellow, color.Reset, err)
		}
		go startSessionPingLoop(url, apiKey, stopPing)
		defer func() {
			if err := postDumperEvent(url, apiKey, "session_end", nil); err != nil {
				fmt.Printf("%s⚠ Failed to notify session end:%s %v\n", color.Yellow, color.Reset, err)
			}
		}()
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sigCh)

	var fh *os.File
	var lastInode uint64
	var lastSize int64
	var buffer []byte
	firstOpen := true
	cachePath := filepath.Join(filepath.Dir(os.Args[0]), ".dumper_cache.json")
	if exePath, err := os.Executable(); err == nil {
		cachePath = filepath.Join(filepath.Dir(exePath), ".dumper_cache.json")
	}

	for {
		select {
		case <-sigCh:
			fmt.Printf("\n%sStopped watching.%s\n", color.Cyan, color.Reset)
			return
		default:
		}

		if fh != nil && !dryRun && apiKey != "" {
			if event := sessionTracker.ExpireStaleCrashIfNeeded(state, time.Now()); event != "" {
				postGameSessionEvent(url, apiKey, event)
			}
		}

		st, err := os.Stat(path)
		if err != nil {
			if fh != nil {
				fh.Close()
				fh = nil
				lastInode = 0
				buffer = nil
				fmt.Printf("%sGame.log not found, waiting for it to appear...%s\n", color.Yellow, color.Reset)
			}
			time.Sleep(1 * time.Second)
			continue
		}

		currentInode := getFileInode(st)
		rotated := fh == nil || (currentInode != 0 && currentInode != lastInode) || st.Size() < lastSize

		if rotated {
			if fh != nil {
				fmt.Printf("%sLog rotation detected — game closed, resetting mission state%s\n", color.Yellow, color.Reset)
				sessionTracker.OnLogRotation(state)
				if !dryRun && apiKey != "" {
					postGameSessionEvent(url, apiKey, "game_quit")
				}
				fh.Close()
				state.mu.Lock()
				state.guidMap = make(map[string]MissionEntry)
				state.recentLifecycle = nil
				state.mu.Unlock()
			}
			if err := reconcileActiveMissionsFromLog(path, state, sessionTracker); err != nil {
				fmt.Printf("%s⚠ Could not reconcile active missions:%s %v\n", color.Yellow, color.Reset, err)
			} else if !dryRun && apiKey != "" {
				syncActiveMissionsToServer(url, apiKey, state)
				if event := sessionTracker.PendingStatusEvent(time.Now()); event != "" {
					postGameSessionEvent(url, apiKey, event)
				}
			}
			fh, err = os.Open(path)
			if err != nil {
				fh = nil
				time.Sleep(1 * time.Second)
				continue
			}
			if _, err := fh.Seek(0, io.SeekEnd); err == nil {
				lastSize = st.Size()
			} else {
				lastSize = 0
			}
			lastInode = currentInode
			buffer = nil
			if firstOpen {
				fmt.Println("Tailing Game.log for new events...")
				firstOpen = false
			} else {
				fmt.Println("Opened new log session...")
			}
		}

		// Read chunk
		tempBuf := make([]byte, 4096)
		n, err := fh.Read(tempBuf)
		if n > 0 {
			buffer = append(buffer, tempBuf[:n]...)
			for {
				nlIdx := bytes.IndexByte(buffer, '\n')
				if nlIdx < 0 {
					break
				}
				line := string(buffer[:nlIdx])
				buffer = buffer[nlIdx+1:]

				line = strings.TrimRight(line, "\r")
				ts := sessionTracker.ResolveTimestamp(line)
				tsStr := ts.Format("2006-01-02 15:04:05")

				if gameEvent := sessionTracker.ProcessLine(line, ts, state); gameEvent != "" {
					if !dryRun && apiKey != "" {
						postGameSessionEvent(url, apiKey, gameEvent)
					}
				}

				if m := patternMarker.FindStringSubmatch(line); len(m) >= 4 {
					defID := ""
					if dm := patternMarkerDefID.FindStringSubmatch(line); len(dm) >= 2 {
						defID = dm[1]
					}
					state.RecordMarker(m[1], m[2], m[3], defID)

				} else if m := patternAccepted.FindStringSubmatch(line); len(m) >= 2 {
					active := state.RecordAccepted(m[1], ts)
					fmt.Printf("  [%s] [%s] %sMission started: %s (%s)%s\n",
						tsStr, filepath.Base(path), color.Green, active.DebugName, active.GUID, color.Reset)
					if !dryRun && apiKey != "" {
						fields := map[string]string{
							"missionGuid":            active.GUID,
							"contractDefinitionId": active.ContractDefinitionID,
							"debugName":              active.DebugName,
						}
						if err := postDumperEvent(url, apiKey, "mission_started", fields); err != nil {
							fmt.Printf("  [Live] %s✗ Mission sync failed:%s %v\n", color.Red, color.Reset, err)
						}
					}

				} else if m := patternEndMission.FindStringSubmatch(line); len(m) >= 4 {
					guid, completion, reason := m[1], m[2], m[3]
					active, exists := state.RecordEnd(guid, completion, ts)
					debugName := "Unknown"
					if exists {
						debugName = active.DebugName
					} else if entry, ok := state.guidMap[guid]; ok {
						debugName = entry.DebugName
					}

					switch completion {
					case "Complete":
						fmt.Printf("  [%s] [%s] %sMission complete: %s (%s) [%s]%s\n",
							tsStr, filepath.Base(path), color.Cyan, debugName, guid, reason, color.Reset)
					case "Abandon":
						fmt.Printf("  [%s] [%s] %sMission abandoned: %s (%s) [%s]%s\n",
							tsStr, filepath.Base(path), color.Red, debugName, guid, reason, color.Reset)
					case "Fail":
						fmt.Printf("  [%s] [%s] %sMission failed: %s (%s) [%s]%s\n",
							tsStr, filepath.Base(path), color.Yellow, debugName, guid, reason, color.Reset)
					default:
						fmt.Printf("  [%s] [%s] %sMission ended (%s): %s (%s) [%s]%s\n",
							tsStr, filepath.Base(path), color.Yellow, completion, debugName, guid, reason, color.Reset)
					}

					if !dryRun && apiKey != "" {
						fields := map[string]string{
							"missionGuid": guid,
							"completion":  completion,
						}
						if err := postDumperEvent(url, apiKey, "mission_ended", fields); err != nil {
							fmt.Printf("  [Live] %s✗ Mission end sync failed:%s %v\n", color.Red, color.Reset, err)
						}
					}

				} else if m := patternBlueprint.FindStringSubmatch(line); len(m) >= 2 {
					productName := strings.TrimSpace(m[1])
					corr, found := state.CorrelateBlueprint(ts)
					if found {
						fmt.Printf("  [%s] [%s] %sBlueprint received: %s%s%s (from %s on %s)%s\n",
							tsStr, filepath.Base(path), color.Magenta, color.Green, productName, color.Magenta, corr.DebugName, corr.Trigger, color.Reset)
					} else {
						fmt.Printf("  [%s] [%s] %sBlueprint received: %s%s%s (no recent mission to correlate)%s\n",
							tsStr, filepath.Base(path), color.Magenta, color.Green, productName, color.Magenta, color.Reset)
					}

					contractDefID := ""
					if found {
						contractDefID = corr.ContractDefinitionID
					}

					cacheKey := cacheKeyForInput(productName)
					if acquiredBps[cacheKey] || acquiredBps[productName] || isBlueprintAcquired(acquiredBps, productName) {
						continue
					}

					if dryRun {
						fmt.Printf("  [Live] %s★ Would Import (Dry Run):%s %s\n", color.Green, color.Reset, productName)
						continue
					}

					status, isDupe, internalName, err := postBlueprintEvent(url, apiKey, productName, contractDefID)
					if err != nil {
						fmt.Printf("  [Live] %s✗ Connection Error:%s %s (%v)\n", color.Red, color.Reset, productName, err)
						continue
					}
					if status == 200 {
						if isDupe {
							fmt.Printf("  [Live] %s↻ Already Acquired (Sync):%s %s\n", color.Yellow, color.Reset, productName)
						} else {
							fmt.Printf("  [Live] %s★ Successfully Imported:%s %s\n", color.Green, color.Reset, productName)
						}
						if internalName != "" {
							acquiredBps[internalName] = true
							saveCacheFile(cachePath, acquiredBps)
						}
					} else if status == 202 {
						fmt.Printf("  [Live] %s⚠ Notification sent — mark manually:%s %s\n", color.Yellow, color.Reset, productName)
					} else {
						fmt.Printf("  [Live] %s✗ Failed to import:%s %s (HTTP %d)\n", color.Red, color.Reset, productName, status)
					}
				}
			}
			lastSize = st.Size()
		} else {
			time.Sleep(500 * time.Millisecond)
		}
	}
}


