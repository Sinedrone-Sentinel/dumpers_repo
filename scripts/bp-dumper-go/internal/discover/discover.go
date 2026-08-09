package discover

import (
	"os"
	"path/filepath"
	"strings"
)

const DefaultWinPath = `C:\Program Files\Roberts Space Industries\StarCitizen`

var knownChannels = map[string]struct{}{
	"LIVE": {}, "PTU": {}, "EPTU": {}, "HOTFIX": {}, "TECH-PREVIEW": {},
}

func IsChannelDir(p string) bool {
	name := strings.ToUpper(filepath.Base(p))
	if _, ok := knownChannels[name]; ok {
		return true
	}
	fi, err := os.Stat(filepath.Join(p, "build_manifest.id"))
	return err == nil && !fi.IsDir()
}

// ValidateLogPath accepts a LIVE/channel folder or a Game.log / .log / .json file path.
func ValidateLogPath(userPath string) (channelOrFile string, errMsg string) {
	userPath = strings.TrimSpace(strings.Trim(userPath, `"' `))
	if userPath == "" {
		return "", "Path is required. Enter your Star Citizen LIVE folder (the folder that contains Game.log)."
	}
	fi, err := os.Stat(userPath)
	if err != nil {
		return "", "Path not found: " + userPath
	}
	if fi.IsDir() {
		gameLog := filepath.Join(userPath, "Game.log")
		if _, err := os.Stat(gameLog); err == nil {
			return userPath, ""
		}
		// Allow logbackups / channel dirs even if Game.log is not present yet
		if IsChannelDir(userPath) {
			return userPath, ""
		}
		return userPath, ""
	}
	return userPath, ""
}
