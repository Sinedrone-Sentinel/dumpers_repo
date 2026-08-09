package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/api"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/appdir"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/cache"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/colors"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/config"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/discover"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/lookup"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/parse"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/update"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/watch"
)

// Version can be overridden via -ldflags "-X main.Version=1.2.3"
var Version = ""

func dumperVersion() string {
	if Version != "" {
		return strings.TrimSpace(Version)
	}
	return strings.TrimSpace(embeddedVersion)
}

func minGameVersion() string {
	v := strings.TrimSpace(embeddedMinGame)
	if v == "" {
		return "4.9"
	}
	return v
}

func exitSCNotDetected() {
	fmt.Printf(
		"%sStar Citizen LIVE install was not detected.%s\n"+
			"Install/launch Star Citizen, or re-run with --configure and enter your LIVE folder path.\n",
		colors.Red, colors.Reset,
	)
	pressAnyKey()
	os.Exit(1)
}

func requirePathMissing() {
	fmt.Printf(
		"%sPath required.%s\n"+
			"Enter your Star Citizen LIVE folder (the folder that contains Game.log),\n"+
			"or leave blank in the wizard to auto-detect, or pass --log-dir / LOG_PATH.\n"+
			"Example: C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\n",
		colors.Red, colors.Reset,
	)
	pressAnyKey()
	os.Exit(1)
}

func pressAnyKey() {
	fmt.Print("Press Enter to exit...")
	_, _ = bufio.NewReader(os.Stdin).ReadBytes('\n')
}

func prompt(reader *bufio.Reader, label string) (string, bool) {
	fmt.Print(label)
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", false
	}
	return strings.TrimSpace(strings.Trim(line, "\"'")), true
}

func resolveChannelDir(filePath, logDir string, env map[string]string) string {
	if logDir != "" {
		if fi, err := os.Stat(logDir); err == nil && fi.IsDir() {
			return logDir
		}
	}
	if filePath != "" {
		if fi, err := os.Stat(filePath); err == nil {
			if fi.IsDir() {
				return filePath
			}
			return filepath.Dir(filePath)
		}
	}
	if backup := env["BACKUP_PATH"]; backup != "" {
		return filepath.Dir(backup)
	}
	installs := discover.DetectSCInstalls()
	if _, p := discover.PreferLIVE(installs); p != "" {
		return p
	}
	return discover.FallbackLIVE()
}

func runFolderImport(
	logDirs []string,
	client *api.Client,
	lu *lookup.Data,
	acquired map[string]struct{},
	cachePath string,
	dryRun bool,
	includeGameLog bool,
	skipVersionCheck bool,
	banner string,
) {
	fmt.Printf("\n%s%s%s\n", colors.Cyan, banner, colors.Reset)
	files := parse.CollectLogFiles(logDirs, includeGameLog)
	if len(files) == 0 {
		fmt.Println("No historical logs to scan.")
		return
	}
	var total int64
	for _, p := range files {
		if st, err := os.Stat(p); err == nil {
			total += st.Size()
		}
	}
	filterNote := fmt.Sprintf(" — min game version %s", minGameVersion())
	if skipVersionCheck {
		filterNote = " — version filter OFF"
	}
	fmt.Printf("Scanning %d log file(s) (%.2f GB total)%s...\n", len(files), float64(total)/(1024*1024*1024), filterNote)

	for _, d := range logDirs {
		if loc := parse.ParseLocalLocalization(d); len(loc) > 0 {
			lu.RegisterCustomTranslations(loc)
		}
	}

	var all []parse.Discovery
	for i, path := range files {
		if !skipVersionCheck && !parse.IsLogVersionAllowed(path, minGameVersion()) {
			fmt.Printf("  [%3d/%d] Skipping %s (game version is below minimum %s)\n", i+1, len(files), filepath.Base(path), minGameVersion())
			continue
		}
		st, _ := os.Stat(path)
		sizeMB := 0.0
		if st != nil {
			sizeMB = float64(st.Size()) / (1024 * 1024)
		}
		note := ""
		if skipVersionCheck {
			note = " [no version filter]"
		}
		fmt.Printf("  [%3d/%d] Scanning %s (%.2f MB)%s...\n", i+1, len(files), filepath.Base(path), sizeMB, note)
		found, err := parse.ParseBlueprintsFromLog(path)
		if err != nil {
			fmt.Printf("%sWarning: Could not read log file %s (%v)%s\n", colors.Yellow, filepath.Base(path), err, colors.Reset)
			continue
		}
		all = append(all, found...)
	}
	unique := parse.CoalesceDiscovered(all)
	if len(unique) == 0 {
		fmt.Println("No blueprints found in historical logs.")
		return
	}
	fmt.Printf("Found %d unique blueprint award name(s) across scanned logs.\n", len(unique))
	uploadDiscovered(unique, client, lu, acquired, cachePath, dryRun)
}

func uploadDiscovered(
	rows []parse.Discovery,
	client *api.Client,
	lu *lookup.Data,
	acquired map[string]struct{},
	cachePath string,
	dryRun bool,
) {
	var toSend []parse.Discovery
	for _, row := range rows {
		if !lu.IsAcquired(acquired, row.Name) {
			toSend = append(toSend, row)
		}
	}
	if len(toSend) == 0 {
		fmt.Println("All discovered historical blueprints already acquired.")
		return
	}
	fmt.Printf("Uploading %d historical blueprint(s)...\n", len(toSend))
	success, dupe, fail := 0, 0, 0
	for idx, row := range toSend {
		if dryRun || client == nil {
			success++
			resolved := lu.Resolve(row.Name, row.ContractID)
			label := row.Name
			if resolved.OK {
				label = resolved.BlueprintName + " → " + resolved.InternalName
			} else if resolved.Error == "ambiguous_blueprint" {
				label = row.Name + " (ambiguous — would notify)"
			}
			fmt.Printf("  [%d/%d] %s★ Would Import:%s %s\n", idx+1, len(toSend), colors.Green, colors.Reset, label)
			continue
		}
		status, isDup, internalName, errMsg, err := client.PostBlueprint(row.Name, row.ContractID)
		if err != nil {
			fail++
			fmt.Printf("  [%d/%d] %s✗ Connection Error:%s %s (%v)\n", idx+1, len(toSend), colors.Red, colors.Reset, row.Name, err)
			continue
		}
		switch {
		case status == 200:
			if isDup {
				dupe++
				fmt.Printf("  [%d/%d] %s↻ Already Acquired:%s %s\n", idx+1, len(toSend), colors.Yellow, colors.Reset, row.Name)
			} else {
				success++
				fmt.Printf("  [%d/%d] %s★ Successfully Imported:%s %s\n", idx+1, len(toSend), colors.Green, colors.Reset, row.Name)
			}
			if internalName != "" {
				acquired[internalName] = struct{}{}
				cache.Save(cachePath, acquired)
			}
		case status == 202:
			success++
			fmt.Printf("  [%d/%d] %s⚠ Notification sent — mark manually:%s %s\n", idx+1, len(toSend), colors.Yellow, colors.Reset, row.Name)
		default:
			fail++
			if errMsg != "" {
				fmt.Printf("  [%d/%d] %s✗ %s%s\n", idx+1, len(toSend), colors.Red, errMsg, colors.Reset)
			} else {
				fmt.Printf("  [%d/%d] %s✗ Failed:%s %s (HTTP %d)\n", idx+1, len(toSend), colors.Red, colors.Reset, row.Name, status)
			}
		}
	}
	fmt.Printf(
		"\nImport complete: %s%d successfully imported%s, %s%d already acquired%s, %s%d failed%s\n",
		colors.Green, success, colors.Reset, colors.Yellow, dupe, colors.Reset, colors.Red, fail, colors.Reset,
	)
}

func main() {
	colors.EnableWindowsANSI()
	colors.MaybeDisableForNonTTY()

	urlFlag := flag.String("url", "", "Override Supabase webhook URL")
	keyFlag := flag.String("key", "", "BP Dumper API key")
	dryRun := flag.Bool("dry-run", false, "Scan only; no network")
	watchFlag := flag.Bool("watch", false, "Watch Game.log (default on)")
	noWatch := flag.Bool("no-watch", false, "Disable watch mode")
	logDirFlag := flag.String("log-dir", "", "Scan a specific log directory")
	fullHistoryFlag := flag.Bool("full-history-import", false, "One-time full history import")
	configure := flag.Bool("configure", false, "Force configuration wizard")
	flag.Parse()

	filePathArg := ""
	if flag.NArg() > 0 {
		filePathArg = flag.Arg(0)
	}

	app := appdir.Dir()
	envPath := filepath.Join(app, ".env")
	envExisted := false
	if _, err := os.Stat(envPath); err == nil {
		envExisted = true
	}
	envVars := config.LoadEnvFile(envPath)

	watchMode := true
	if *noWatch {
		watchMode = false
	} else if *watchFlag {
		watchMode = true
	} else if envVars["WATCH_MODE"] == "false" {
		watchMode = false
	} else if envVars["WATCH_MODE"] == "true" {
		watchMode = true
	}

	reader := bufio.NewReader(os.Stdin)
	interactive := *configure || (isTTY() && !*dryRun &&
		*keyFlag == "" && os.Getenv("LOG_WATCHER_API_KEY") == "" && envVars["LOG_WATCHER_API_KEY"] == "")

	filePath := filePathArg
	apiKey := *keyFlag
	importOldLogs := "true"
	fullHistoryImport := "false"

	if interactive {
		fmt.Printf("%s====================================================%s\n", colors.Cyan, colors.Reset)
		fmt.Printf("%s             BP Dumper Configuration Wizard%s\n", colors.Cyan, colors.Reset)
		fmt.Printf("%s====================================================%s\n\n", colors.Cyan, colors.Reset)
		fmt.Printf("%sSource: github.com/Sinedrone-Sentinel/dumpers_repo (native Windows client)%s\n", colors.Dim, colors.Reset)
		fmt.Printf("%sTrust:  OpenSSF Scorecard + site Trust links under Dumper Apps%s\n", colors.Dim, colors.Reset)
		fmt.Printf("%sTip:    Leave the path blank — BP Dumper searches for your LIVE install.%s\n\n", colors.Dim, colors.Reset)

		defaultPath := envVars["LOG_PATH"]
		pathPrompt := "Enter path to JSON export or folder (Leave empty to auto-detect SC logs)"
		if defaultPath != "" {
			pathPrompt += " [" + defaultPath + "]"
		}
		pathPrompt += ": "
		userPath, ok := prompt(reader, pathPrompt)
		if !ok {
			fmt.Println("\nAborted.")
			os.Exit(0)
		}
		if userPath == "" && defaultPath != "" {
			userPath = defaultPath
		}
		if userPath == "" {
			fmt.Printf("%sAuto-detecting Star Citizen installations...%s\n", colors.Dim, colors.Reset)
			installs := discover.DetectSCInstalls()
			if ch, p := discover.PreferLIVE(installs); p != "" {
				fmt.Printf("%sDetected channel %s at: %s%s\n", colors.Green, ch, p, colors.Reset)
				userPath = p
			} else if live := discover.FallbackLIVE(); live != "" {
				fmt.Printf("%sDetected default fallback at: %s%s\n", colors.Green, live, colors.Reset)
				userPath = live
			} else {
				exitSCNotDetected()
			}
		} else if validated, errMsg := discover.ValidateLogPath(userPath); errMsg != "" {
			fmt.Printf("%s%s%s\n", colors.Red, errMsg, colors.Reset)
			requirePathMissing()
		} else {
			userPath = validated
		}
		filePath = userPath

		dryAns, ok := prompt(reader, "Dry run only? (Y/N, Enter = N): ")
		if !ok {
			fmt.Println("\nAborted.")
			os.Exit(0)
		}
		if strings.EqualFold(dryAns, "y") {
			*dryRun = true
		}

		watchAns, ok := prompt(reader, "Watch mode (trail log file in real-time)? (Y/N, Enter = Y): ")
		if !ok {
			fmt.Println("\nAborted.")
			os.Exit(0)
		}
		watchMode = !strings.EqualFold(watchAns, "n")

		if !*dryRun {
			defaultKey := envVars["LOG_WATCHER_API_KEY"]
			keyPrompt := "Enter your BP Dumper API key from Settings (e.g. dr_...)"
			if defaultKey != "" {
				masked := defaultKey
				if len(defaultKey) > 10 {
					masked = defaultKey[:6] + "..." + defaultKey[len(defaultKey)-4:]
				}
				keyPrompt += " [" + masked + "]"
			}
			keyPrompt += ": "
			userKey, ok := prompt(reader, keyPrompt)
			if !ok {
				fmt.Println("\nAborted.")
				os.Exit(0)
			}
			if userKey == "" {
				userKey = defaultKey
			}
			apiKey = userKey
		}

		importAns, ok := prompt(reader, fmt.Sprintf(
			"Import recent backup logs on first run (min version %s+ only)? (Y/N, Enter = Y): ", minGameVersion(),
		))
		if !ok {
			fmt.Println("\nAborted.")
			os.Exit(0)
		}
		if strings.EqualFold(importAns, "n") {
			importOldLogs = "false"
		}

		fullDefault := "Y"
		if envExisted {
			fullDefault = "N"
		}
		fmt.Println()
		fmt.Printf(
			"%sFull history import%s scans EVERY .log file (including older patches below %s and the current Game.log). "+
				"Use this once to catch up BPs from large logbackups. It can take a long time.\n",
			colors.Yellow, colors.Reset, minGameVersion(),
		)
		fullAns, ok := prompt(reader, fmt.Sprintf("Run one-time FULL history import now? (Y/N, Enter = %s): ", fullDefault))
		if !ok {
			fmt.Println("\nAborted.")
			os.Exit(0)
		}
		switch {
		case fullAns == "":
			if !envExisted {
				fullHistoryImport = "true"
			}
		case strings.EqualFold(fullAns, "y"):
			fullHistoryImport = "true"
		default:
			fullHistoryImport = "false"
		}
		fmt.Println()

		resolvedURL := *urlFlag
		if resolvedURL == "" {
			resolvedURL = envVars["SUPABASE_WEBHOOK_URL"]
		}
		if resolvedURL == "" {
			resolvedURL = api.DefaultWebhookURL
		}
		newEnv := map[string]string{
			"LOG_PATH":             filePath,
			"SUPABASE_WEBHOOK_URL": "",
			"LOG_WATCHER_API_KEY":  apiKey,
			"IMPORT_OLD_LOGS":      importOldLogs,
			"FULL_HISTORY_IMPORT":  fullHistoryImport,
			"WATCH_MODE":           boolStr(watchMode),
		}
		if !*dryRun {
			newEnv["SUPABASE_WEBHOOK_URL"] = resolvedURL
		}
		for k, v := range newEnv {
			envVars[k] = v
		}
		_ = config.SaveEnvFile(envPath, envVars)
	}

	if filePath == "" && *logDirFlag == "" {
		if envVars["LOG_PATH"] != "" {
			filePath = envVars["LOG_PATH"]
		} else {
			installs := discover.DetectSCInstalls()
			if len(installs) == 0 && discover.FallbackLIVE() == "" {
				exitSCNotDetected()
			}
		}
	}

	url := *urlFlag
	if url == "" {
		url = os.Getenv("SUPABASE_WEBHOOK_URL")
	}
	if url == "" {
		url = envVars["SUPABASE_WEBHOOK_URL"]
	}
	if url == "" {
		url = api.DefaultWebhookURL
	}

	if !*dryRun {
		if apiKey == "" {
			apiKey = os.Getenv("LOG_WATCHER_API_KEY")
		}
		if apiKey == "" {
			apiKey = envVars["LOG_WATCHER_API_KEY"]
		}
		if apiKey == "" {
			fmt.Fprintf(os.Stderr, "%sError: API key must be provided via --key, LOG_WATCHER_API_KEY, or .env.%s\n", colors.Red, colors.Reset)
			os.Exit(1)
		}
	}


	lu, err := lookup.Load(embeddedLookup, app)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load lookup.json: %v\n", err)
		os.Exit(1)
	}

	cachePath := filepath.Join(app, ".dumper_cache.json")
	acquired := cache.Load(cachePath)
	ver := dumperVersion()

	var client *api.Client
	if !*dryRun {
		client = api.New(url, apiKey, ver, lu)
		fmt.Printf("%sSynchronizing blueprints list from server (dumper %s)...%s\n", colors.Dim, ver, colors.Reset)
		bps, latest, dl, err := client.SyncAcquired()
		if err != nil {
			if u, ok := err.(*api.UpdateRequiredError); ok {
				update.HandleUpdateRequired(u, ver)
			}
			fmt.Printf("%sError: Could not sync with server (%v).%s\n", colors.Red, err, colors.Reset)
			os.Exit(1)
		}
		for _, bp := range bps {
			acquired[bp] = struct{}{}
		}
		cache.Save(cachePath, acquired)
		fmt.Printf("Synced %d blueprints from account.\n", len(bps))
		if latest != "" && api.IsNewerVersion(latest, ver) {
			update.HandleUpdateRequired(&api.UpdateRequiredError{Latest: latest, DownloadURL: dl}, ver)
		}
	}

	runFullHistory := *fullHistoryFlag || envVars["FULL_HISTORY_IMPORT"] == "true"
	runRecent := envVars["IMPORT_OLD_LOGS"] == "true"
	didBatch := false

	if runFullHistory || runRecent {
		channelDir := resolveChannelDir(filePath, *logDirFlag, envVars)
		var logDirs []string
		if *logDirFlag != "" {
			logDirs = []string{*logDirFlag}
		} else if channelDir != "" {
			logDirs = []string{channelDir, filepath.Join(channelDir, "logbackups")}
		}
		if runFullHistory {
			didBatch = true
			runFolderImport(logDirs, client, lu, acquired, cachePath, *dryRun, true, true,
				"[Full History] Scanning ALL .log files (version filter OFF) — one-time catch-up for your account...")
			envVars["FULL_HISTORY_IMPORT"] = "false"
			envVars["IMPORT_OLD_LOGS"] = "false"
			_ = config.SaveEnvFile(envPath, envVars)
			fmt.Printf("%s[Full History] Import complete. FULL_HISTORY_IMPORT disabled for future launches.%s\n\n", colors.Green, colors.Reset)
		} else if runRecent {
			didBatch = true
			runFolderImport(logDirs, client, lu, acquired, cachePath, *dryRun, false, false,
				fmt.Sprintf("[First Run] Scanning backup logs (min version %s+)...", minGameVersion()))
			envVars["IMPORT_OLD_LOGS"] = "false"
			_ = config.SaveEnvFile(envPath, envVars)
			fmt.Printf("%s[First Run] Recent-log import complete. Disabling future auto-imports.%s\n\n", colors.Green, colors.Reset)
		}
	}

	if watchMode {
		if didBatch {
			fmt.Printf("%s[Watch Mode] Batch import finished. Tailing Game.log for new blueprints...%s\n\n", colors.Cyan, colors.Reset)
		}
		watchFile := ""
		if filePath != "" {
			if fi, err := os.Stat(filePath); err == nil {
				if fi.IsDir() {
					watchFile = filepath.Join(filePath, "Game.log")
				} else {
					watchFile = filePath
				}
			}
		} else if *logDirFlag != "" {
			watchFile = filepath.Join(*logDirFlag, "Game.log")
		} else if envVars["LOG_PATH"] != "" {
			p := envVars["LOG_PATH"]
			if fi, err := os.Stat(p); err == nil && fi.IsDir() {
				watchFile = filepath.Join(p, "Game.log")
			} else {
				watchFile = p
			}
		} else {
			installs := discover.DetectSCInstalls()
			if _, p := discover.PreferLIVE(installs); p != "" {
				watchFile = filepath.Join(p, "Game.log")
			} else if live := discover.FallbackLIVE(); live != "" {
				watchFile = filepath.Join(live, "Game.log")
			}
		}
		if watchFile == "" {
			exitSCNotDetected()
		}

		channelDir := filepath.Dir(watchFile)
		if loc := parse.ParseLocalLocalization(channelDir); len(loc) > 0 {
			lu.RegisterCustomTranslations(loc)
			fmt.Printf("%sLoaded %d custom translations from local global.ini (StarStrings/localization mod active)%s\n", colors.Green, len(loc), colors.Reset)
		}

		// Graceful session_end on Ctrl+C
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
		go func() {
			<-sigCh
			fmt.Printf("\n%sStopped watching.%s\n", colors.Cyan, colors.Reset)
			if client != nil && !*dryRun {
				_ = client.PostEvent("session_end", nil)
			}
			os.Exit(0)
		}()

		watch.Run(watch.Options{
			Path:          watchFile,
			Client:        client,
			Acquired:      acquired,
			CachePath:     cachePath,
			DryRun:        *dryRun,
			DumperVersion: ver,
		})
		return
	}

	fmt.Println("Watch mode disabled. Historical import finished (or nothing to do).")
}

func boolStr(v bool) string {
	if v {
		return "true"
	}
	return "false"
}

func isTTY() bool {
	fi, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}
