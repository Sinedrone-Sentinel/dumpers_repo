package parse

import "regexp"

var (
	PatternTimestamp = regexp.MustCompile(`^<([0-9T:\-.Z]+)>`)
	PatternMarkerDefID = regexp.MustCompile(`contractDefinitionId\[([^\]]+)\]`)
	PatternMissionGenerator = regexp.MustCompile(`generator name \[([^\]]+)\]`)
	PatternMissionContract = regexp.MustCompile(`missionId \[([^\]]+)\].*contract \[([^\]]+)\]`)
	PatternAccepted = regexp.MustCompile(
		`Added notification "Contract Accepted:\s*(?P<title>.*?)\s*MissionId:\s*\[(?P<guid>[^\]]+)\]`,
	)
	PatternAcceptedFallback = regexp.MustCompile(
		`Added notification "Contract Accepted:.*?MissionId:\s*\[(?P<guid>[^\]]+)\]`,
	)
	PatternEndMission = regexp.MustCompile(
		`<EndMission>.*MissionId\[([^\]]+)\].*CompletionType\[(\w+)\].*Reason\[([^\]]+)\]`,
	)
	PatternBlueprint = regexp.MustCompile(`Added notification "Received Blueprint: ([^:]+):`)
	PatternExitMenu  = regexp.MustCompile(`Requesting game mode Frontend_Main/SC_Frontend`)
	// AFK / inactivity kick (seen before Frontend_Main in Game.log).
	PatternPlayerInactive = regexp.MustCompile(`Remote Disconnect - player inactive`)
	PatternCrash     = regexp.MustCompile(`Cloud Imperium Games public crash handler taking over`)
	PatternLogStarted = regexp.MustCompile(`Log started on`)
	// Go RE2 has no lookahead — filter Frontend_* in IsPUEntryLine.
	PatternLoadingPU = regexp.MustCompile(`(?i)Loading screen for ([^:\n]+) : SC_\w+ closed`)
	PatternPUEntered = regexp.MustCompile(`taskname="OnClientEnteredGame".*gamerules="SC_(\w+)"`)

	RepInTitleRE   = regexp.MustCompile(`(?i)\[(\d+)\s*/\s*(\d+)\s*(?:rep)?\]`)
	LogNoiseTailRE = regexp.MustCompile(`(?i)\s:\s*"\s*\[\d+\]\s*To Queue|\[\d+\]\s*To Queue`)
	HTMLTagRE      = regexp.MustCompile(`<[^>]+>`)
	ProductVersionRE = regexp.MustCompile(`([0-9]+)\.([0-9]+)`)
)

const (
	CrashRecoveryWindowSec     = 1800.0
	BlueprintCorrelationWindow = 5.0
)
