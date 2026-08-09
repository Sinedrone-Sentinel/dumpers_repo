package watch

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/api"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/cache"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/colors"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/parse"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/update"
)

type Options struct {
	Path            string
	Client          *api.Client
	Acquired        map[string]struct{}
	CachePath       string
	DryRun          bool
	KeepUpToDate    bool
	DumperVersion   string
}

func postGameSession(c *api.Client, eventType string) {
	if eventType == "" || c == nil {
		return
	}
	labels := map[string]string{
		"game_exit_menu":   "Quit to menu",
		"game_quit":        "Game closed",
		"game_crash":       "Game crash detected",
		"game_reconnected": "Back online in PU",
		"game_tracking":    "Resumed normal tracking",
	}
	label := labels[eventType]
	if label == "" {
		label = eventType
	}
	if err := c.PostEvent(eventType, nil); err != nil {
		fmt.Printf("  [Live] %s✗ Game status sync failed (%s):%s %v\n", colors.Red, label, colors.Reset, err)
		return
	}
	fmt.Printf("  [Live] %sGame status:%s %s\n", colors.Cyan, colors.Reset, label)
}

func publishLiveTracker(c *api.Client, state *parse.WatcherState, session *parse.SessionTracker, ping *api.PingController) error {
	statusEvent := session.PendingStatusEvent(float64(time.Now().Unix()))
	if !parse.IsLiveMissionSyncReady(session) {
		if statusEvent != "" {
			postGameSession(c, statusEvent)
		}
		if ping != nil {
			ping.Pause("not in PU")
		}
		fmt.Printf("%sLive tracker waiting — not in PU yet (no mission sync)%s\n", colors.Cyan, colors.Reset)
		return nil
	}
	if err := c.SyncActiveMissions(state); err != nil {
		return err
	}
	if len(state.Active) > 0 {
		fmt.Printf("%sSynced %d active mission(s) from Game.log%s\n", colors.Cyan, len(state.Active), colors.Reset)
	} else {
		fmt.Printf("%sLive missions cleared — none active in Game.log%s\n", colors.Cyan, colors.Reset)
	}
	ev := statusEvent
	if ev == "" {
		ev = "game_tracking"
	}
	postGameSession(c, ev)
	if ping != nil {
		ping.Resume("in PU")
	}
	return nil
}

func ImportDiscoveredBlueprint(
	productName string,
	ts float64,
	state *parse.WatcherState,
	logName string,
	c *api.Client,
	acquired map[string]struct{},
	cachePath string,
	dryRun bool,
	keepUpToDate bool,
	dumperVersion string,
	livePrefix string,
) bool {
	corr := state.CorrelateBlueprint(ts)
	tsStr := parse.FormatLogTS(ts)
	if corr != nil {
		fmt.Printf(
			"  [%s] [%s] %sBlueprint received: %s%s%s%s (from %s on %s)%s\n",
			tsStr, logName, colors.Magenta, colors.Green, productName, colors.Reset, colors.Magenta, corr.DebugName, corr.Trigger, colors.Reset,
		)
	} else {
		fmt.Printf(
			"  [%s] [%s] %sBlueprint received: %s%s%s%s (no recent mission to correlate)%s\n",
			tsStr, logName, colors.Magenta, colors.Green, productName, colors.Reset, colors.Magenta, colors.Reset,
		)
	}
	contractDefID := ""
	if corr != nil {
		contractDefID = corr.ContractDefinitionID
	}
	if c != nil && c.Lookup.IsAcquired(acquired, productName) {
		return false
	}
	if dryRun || c == nil {
		fmt.Printf("  %s %s★ Would Import (Dry Run):%s %s\n", livePrefix, colors.Green, colors.Reset, productName)
		return false
	}
	status, isDup, internalName, errMsg, err := c.PostBlueprint(productName, contractDefID)
	if err != nil {
		if u, ok := err.(*api.UpdateRequiredError); ok {
			ver := dumperVersion
			if ver == "" && c != nil {
				ver = c.Version
			}
			update.HandleUpdateRequired(u, ver, keepUpToDate)
		}
		fmt.Printf("  %s %s✗ Connection Error:%s %s (%v)\n", livePrefix, colors.Red, colors.Reset, productName, err)
		return false
	}
	switch {
	case status == 200:
		if isDup {
			fmt.Printf("  %s %s↻ Already Acquired (Sync):%s %s\n", livePrefix, colors.Yellow, colors.Reset, productName)
		} else {
			fmt.Printf("  %s %s★ Successfully Imported:%s %s\n", livePrefix, colors.Green, colors.Reset, productName)
		}
		if internalName != "" {
			acquired[internalName] = struct{}{}
			cache.Save(cachePath, acquired)
		}
		return !isDup
	case status == 202:
		fmt.Printf("  %s %s⚠ Notification sent — mark manually:%s %s\n", livePrefix, colors.Yellow, colors.Reset, productName)
		return true
	default:
		if errMsg != "" {
			fmt.Printf("  %s %s✗ %s%s\n", livePrefix, colors.Red, errMsg, colors.Reset)
		} else {
			fmt.Printf("  %s %s✗ Failed to import:%s %s (HTTP %d)\n", livePrefix, colors.Red, colors.Reset, productName, status)
		}
		return false
	}
}

func SyncBlueprintsFromLog(path string, c *api.Client, acquired map[string]struct{}, cachePath string, dryRun bool) int {
	imported := 0
	state := parse.NewWatcherState()
	f, err := os.Open(path)
	if err != nil {
		fmt.Printf("%s⚠ Could not scan %s for blueprints:%s %v\n", colors.Yellow, path, colors.Reset, err)
		return 0
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		return 0
	}
	for _, raw := range bytes.Split(data, []byte{'\n'}) {
		line := strings.TrimRight(string(raw), "\r")
		if line == "" {
			continue
		}
		ts, ok := parse.ParseLogTimestamp(line)
		if !ok {
			ts = 0
		}
		parse.ApplyMissionLogLine(line, state, ts)
		if m := parse.PatternBlueprint.FindStringSubmatch(line); m != nil {
			ver := ""
			keep := true
			if c != nil {
				ver = c.Version
			}
			if ImportDiscoveredBlueprint(strings.TrimSpace(m[1]), ts, state, filepathBase(path), c, acquired, cachePath, dryRun, keep, ver, "[Startup]") {
				imported++
			}
		}
	}
	if imported > 0 {
		fmt.Printf("%sStartup sync: imported %d blueprint(s) from current Game.log%s\n", colors.Cyan, imported, colors.Reset)
	}
	return imported
}

func filepathBase(p string) string {
	i := strings.LastIndexAny(p, `/\`)
	if i < 0 {
		return p
	}
	return p[i+1:]
}

func syncReconnect(c *api.Client, path string, state *parse.WatcherState, session *parse.SessionTracker) error {
	if err := parse.ReconcileActiveMissionsFromLog(path, state, session); err != nil {
		return err
	}
	if err := c.SyncActiveMissions(state); err != nil {
		return err
	}
	postGameSession(c, "game_reconnected")
	return nil
}

func Run(opts Options) {
	fmt.Printf("%sWatching %s for live events... (Press Ctrl+C to stop)%s\n", colors.Cyan, filepathBase(opts.Path), colors.Reset)
	state := parse.NewWatcherState()
	session := &parse.SessionTracker{}
	pingCtrl := api.NewPingController()
	stopPing := make(chan struct{})
	if opts.Client != nil && !opts.DryRun {
		go api.StartSessionPingLoop(opts.Client, stopPing, pingCtrl)
	}
	defer close(stopPing)

	var fh *os.File
	var lastSize int64
	var buffer []byte
	firstOpen := true
	path := opts.Path

	handleUpdate := func(err *api.UpdateRequiredError) {
		update.HandleUpdateRequired(err, opts.DumperVersion, opts.KeepUpToDate)
	}

	for {
		if u := pingCtrl.TakeUpdateRequired(); u != nil {
			handleUpdate(u)
		}
		st, err := os.Stat(path)
		if err != nil {
			if fh != nil {
				_ = fh.Close()
				fh = nil
				buffer = nil
				fmt.Printf("%sGame.log not found, waiting for it to appear...%s\n", colors.Yellow, colors.Reset)
			}
			pingCtrl.Pause("Game.log missing")
			time.Sleep(time.Second)
			continue
		}

		rotated := fh == nil || st.Size() < lastSize
		if rotated {
			if fh != nil {
				fmt.Printf("%sLog rotation detected — game closed, resetting mission state%s\n", colors.Yellow, colors.Reset)
				session.OnLogRotation(state)
				if opts.Client != nil && !opts.DryRun {
					postGameSession(opts.Client, "game_quit")
					pingCtrl.Pause("log rotation / game closed")
				}
				_ = fh.Close()
				state.GUIDMap = map[string]*parse.MissionEntry{}
				state.RecentLifecycle = nil
			}
			_ = parse.ReconcileActiveMissionsFromLog(path, state, nil)
			_ = parse.SeedSessionTrackerFromLog(path, session)
			parse.EnsureAwaitingPU(session)
			if opts.Client != nil && !opts.DryRun {
				SyncBlueprintsFromLog(path, opts.Client, opts.Acquired, opts.CachePath, opts.DryRun)
				if err := opts.Client.PostEvent("session_start", nil); err != nil {
					if u, ok := err.(*api.UpdateRequiredError); ok {
						handleUpdate(u)
					}
				}
				if err := publishLiveTracker(opts.Client, state, session, pingCtrl); err != nil {
					if u, ok := err.(*api.UpdateRequiredError); ok {
						handleUpdate(u)
					} else {
						fmt.Printf("%s⚠ Could not sync live tracker:%s %v\n", colors.Yellow, colors.Reset, err)
					}
				}
			}
			f, err := os.Open(path)
			if err != nil {
				fh = nil
				time.Sleep(time.Second)
				continue
			}
			fh = f
			_, _ = fh.Seek(0, io.SeekEnd)
			lastSize = st.Size()
			buffer = nil
			if firstOpen {
				fmt.Println("Tailing Game.log for new events...")
				firstOpen = false
			} else {
				fmt.Println("Opened new log session...")
			}
		}

		if fh != nil && opts.Client != nil && !opts.DryRun {
			if expired := session.ExpireStaleCrashIfNeeded(state); expired != "" {
				postGameSession(opts.Client, expired)
				if expired == "game_tracking" {
					pingCtrl.Resume("crash wait ended")
				} else {
					pingCtrl.Pause(expired)
				}
			}
		}

		if fh == nil {
			time.Sleep(500 * time.Millisecond)
			continue
		}

		chunk := make([]byte, 64*1024)
		n, err := fh.Read(chunk)
		if n > 0 {
			pingCtrl.Resume("new log activity")
			buffer = append(buffer, chunk[:n]...)
			for {
				nl := bytes.IndexByte(buffer, '\n')
				if nl < 0 {
					break
				}
				raw := buffer[:nl]
				buffer = buffer[nl+1:]
				line := strings.TrimRight(string(raw), "\r")
				if line == "" {
					continue
				}
				ts := session.ResolveTimestamp(line)
				tsStr := parse.FormatLogTS(ts)
				wasPaused := session.PausedReason != "" || session.CrashAt != nil

				gameEvent := session.ProcessLine(line, ts, state)
				if gameEvent == "game_reconnected" && opts.Client != nil && !opts.DryRun {
					if err := syncReconnect(opts.Client, path, state, session); err != nil {
						fmt.Printf("  [Live] %s⚠ Could not resync missions after reconnect:%s %v\n", colors.Yellow, colors.Reset, err)
					} else {
						pingCtrl.Resume("reconnected")
					}
				} else if (gameEvent == "game_exit_menu" || gameEvent == "game_quit") && opts.Client != nil && !opts.DryRun {
					postGameSession(opts.Client, gameEvent)
					pingCtrl.Pause(gameEvent)
				} else if gameEvent != "" && opts.Client != nil && !opts.DryRun {
					postGameSession(opts.Client, gameEvent)
				}

				active := parse.ApplyMissionLogLine(line, state, ts)
				missionEnd := parse.PatternEndMission.FindStringSubmatch(line)
				blueprintHit := parse.PatternBlueprint.FindStringSubmatch(line)

				if active != nil {
					session.OnMissionAccepted()
					fmt.Printf("  [%s] [%s] %sMission started: %s (%s)%s\n", tsStr, filepathBase(path), colors.Green, active.DebugName, active.GUID, colors.Reset)
					if opts.Client != nil && !opts.DryRun && parse.IsLiveMissionSyncReady(session) {
						_ = opts.Client.PostEvent("mission_started", map[string]any{
							"missionGuid":          active.GUID,
							"contractDefinitionId": active.ContractDefinitionID,
							"debugName":            active.DebugName,
						})
						pingCtrl.Resume("mission activity")
					}
				} else if missionEnd != nil {
					// ApplyMissionLogLine already recorded end; fetch names from maps
					guid, completion, reason := missionEnd[1], missionEnd[2], missionEnd[3]
					entry := state.GUIDMap[guid]
					debugName := "Unknown"
					if entry != nil {
						debugName = entry.DebugName
					}
					switch completion {
					case "Complete":
						fmt.Printf("  [%s] [%s] %sMission complete: %s (%s) [%s]%s\n", tsStr, filepathBase(path), colors.Cyan, debugName, guid, reason, colors.Reset)
					case "Abandon":
						fmt.Printf("  [%s] [%s] %sMission abandoned: %s (%s) [%s]%s\n", tsStr, filepathBase(path), colors.Red, debugName, guid, reason, colors.Reset)
					case "Fail":
						fmt.Printf("  [%s] [%s] %sMission failed: %s (%s) [%s]%s\n", tsStr, filepathBase(path), colors.Yellow, debugName, guid, reason, colors.Reset)
					default:
						fmt.Printf("  [%s] [%s] %sMission ended (%s): %s (%s) [%s]%s\n", tsStr, filepathBase(path), colors.Yellow, completion, debugName, guid, reason, colors.Reset)
					}
					if opts.Client != nil && !opts.DryRun && parse.IsLiveMissionSyncReady(session) {
						_ = opts.Client.PostEvent("mission_ended", map[string]any{
							"missionGuid": guid,
							"completion":  completion,
						})
					}
				} else if blueprintHit != nil {
					ImportDiscoveredBlueprint(
						strings.TrimSpace(blueprintHit[1]), ts, state, filepathBase(path),
						opts.Client, opts.Acquired, opts.CachePath, opts.DryRun,
						opts.KeepUpToDate, opts.DumperVersion, "[Live]",
					)
				}

				if wasPaused && gameEvent == "" && opts.Client != nil && !opts.DryRun && (active != nil || missionEnd != nil || blueprintHit != nil) {
					session.MarkBackInPU(state, ts)
					if err := syncReconnect(opts.Client, path, state, session); err != nil {
						fmt.Printf("  [Live] %s⚠ Could not resync after PU activity:%s %v\n", colors.Yellow, colors.Reset, err)
					} else {
						pingCtrl.Resume("back in PU")
					}
				}
			}
			lastSize = st.Size()
		} else if err == io.EOF || n == 0 {
			time.Sleep(500 * time.Millisecond)
		} else {
			time.Sleep(time.Second)
		}
	}
}
