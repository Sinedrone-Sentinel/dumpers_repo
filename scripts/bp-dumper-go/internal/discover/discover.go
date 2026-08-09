package discover

import (
	"os"
	"path/filepath"
	"strings"
)

const (
	DefaultWinPath = `C:\Program Files\Roberts Space Industries\StarCitizen`
	ScanMaxDepth   = 4
)

var (
	scanSkipDirs = map[string]struct{}{
		"windows": {}, "windows.old": {}, "winsxs": {},
		"$recycle.bin": {}, "$winreagent": {}, "$sysreset": {}, "$getcurrent": {},
		"system volume information": {}, "config.msi": {}, "recovery": {}, "boot": {},
		"programdata": {}, "appdata": {},
		"perflogs": {}, "onedrivetemp": {},
		"node_modules": {}, ".git": {}, ".svn": {}, ".hg": {},
	}
	scRootNames = map[string]struct{}{
		"starcitizen": {}, "star citizen": {},
	}
	knownChannels = map[string]struct{}{
		"LIVE": {}, "PTU": {}, "EPTU": {}, "HOTFIX": {}, "TECH-PREVIEW": {},
	}
)

func isChannelDir(p string) bool {
	name := strings.ToUpper(filepath.Base(p))
	if _, ok := knownChannels[name]; ok {
		return true
	}
	fi, err := os.Stat(filepath.Join(p, "build_manifest.id"))
	return err == nil && !fi.IsDir()
}

func looksLikeSCRoot(p string) bool {
	entries, err := os.ReadDir(p)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if e.IsDir() && isChannelDir(filepath.Join(p, e.Name())) {
			return true
		}
	}
	return false
}

type queueItem struct {
	path  string
	depth int
}

func findSCRoots(driveRoot string, maxDepth int) []string {
	var roots []string
	q := []queueItem{{driveRoot, 0}}
	for len(q) > 0 {
		cur := q[0]
		q = q[1:]
		entries, err := os.ReadDir(cur.path)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			nameLower := strings.ToLower(e.Name())
			if _, skip := scanSkipDirs[nameLower]; skip {
				continue
			}
			full := filepath.Join(cur.path, e.Name())
			if _, ok := scRootNames[nameLower]; ok && looksLikeSCRoot(full) {
				roots = append(roots, full)
				continue
			}
			if cur.depth+1 < maxDepth {
				q = append(q, queueItem{full, cur.depth + 1})
			}
		}
	}
	return roots
}

// DetectSCInstalls returns channel name → channel directory (Windows only; empty elsewhere).
func DetectSCInstalls() map[string]string {
	found := map[string]string{}
	for _, root := range fixedDriveRoots() {
		for _, scRoot := range findSCRoots(root, ScanMaxDepth) {
			entries, err := os.ReadDir(scRoot)
			if err != nil {
				continue
			}
			for _, e := range entries {
				if !e.IsDir() {
					continue
				}
				channelDir := filepath.Join(scRoot, e.Name())
				if !isChannelDir(channelDir) {
					continue
				}
				channel := strings.ToUpper(e.Name())
				if _, exists := found[channel]; !exists {
					found[channel] = channelDir
				}
			}
		}
	}
	return found
}

func PreferLIVE(installs map[string]string) (channel, path string) {
	if p, ok := installs["LIVE"]; ok {
		return "LIVE", p
	}
	for k, v := range installs {
		return k, v
	}
	return "", ""
}

func FallbackLIVE() string {
	live := filepath.Join(DefaultWinPath, "LIVE")
	if fi, err := os.Stat(live); err == nil && fi.IsDir() {
		return live
	}
	return ""
}
