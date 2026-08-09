package parse

import (
	"bufio"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/lookup"
)

type Discovery struct {
	Name       string
	ContractID string
}

func ParseBlueprintsFromLog(path string) ([]Discovery, error) {
	var discovered []Discovery
	state := NewWatcherState()
	f, err := os.Open(path)
	if err != nil {
		return nil, err
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
		ts, ok := ParseLogTimestamp(line)
		if !ok {
			ts = 0
		}
		ApplyMissionLogLine(line, state, ts)
		if m := PatternBlueprint.FindStringSubmatch(line); m != nil {
			product := strings.TrimSpace(m[1])
			corr := state.CorrelateBlueprint(ts)
			cid := ""
			if corr != nil {
				cid = corr.ContractDefinitionID
			}
			discovered = append(discovered, Discovery{Name: product, ContractID: cid})
		}
	}
	return discovered, sc.Err()
}

func CoalesceDiscovered(items []Discovery) []Discovery {
	byKey := map[string]Discovery{}
	for _, item := range items {
		key := lookup.NormalizeDisplayKey(item.Name)
		if key == "" {
			continue
		}
		prev, ok := byKey[key]
		if !ok {
			byKey[key] = item
			continue
		}
		pickName := prev.Name
		hasGrade := lookup.HasGradePrefix(item.Name)
		prevHas := lookup.HasGradePrefix(prev.Name)
		if hasGrade && !prevHas {
			pickName = item.Name
		}
		pickContract := item.ContractID
		if pickContract == "" {
			pickContract = prev.ContractID
		}
		byKey[key] = Discovery{Name: pickName, ContractID: pickContract}
	}
	out := make([]Discovery, 0, len(byKey))
	for _, v := range byKey {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out
}

func IsLogVersionAllowed(path, minVersion string) bool {
	if minVersion == "" {
		return true
	}
	parts := ProductVersionRE.FindStringSubmatch(minVersion)
	if parts == nil {
		return true
	}
	minMajor, _ := strconv.Atoi(parts[1])
	minMinor, _ := strconv.Atoi(parts[2])
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for i := 0; sc.Scan() && i <= 150; i++ {
		line := sc.Text()
		lower := strings.ToLower(line)
		if idx := strings.Index(lower, "product version:"); idx != -1 {
			if m := ProductVersionRE.FindStringSubmatch(line[idx+16:]); m != nil {
				maj, _ := strconv.Atoi(m[1])
				min, _ := strconv.Atoi(m[2])
				return maj > minMajor || (maj == minMajor && min >= minMinor)
			}
		}
		if idx := strings.Index(lower, "branch:"); idx != -1 {
			if m := ProductVersionRE.FindStringSubmatch(line[idx+7:]); m != nil {
				maj, _ := strconv.Atoi(m[1])
				min, _ := strconv.Atoi(m[2])
				return maj > minMajor || (maj == minMajor && min >= minMinor)
			}
		}
	}
	return true
}

func ParseLocalLocalization(channelDir string) map[string][]string {
	localMap := map[string][]string{}
	locDir := filepath.Join(channelDir, "data", "Localization")
	fi, err := os.Stat(locDir)
	if err != nil || !fi.IsDir() {
		return localMap
	}
	_ = filepath.WalkDir(locDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.EqualFold(d.Name(), "global.ini") {
			return nil
		}
		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer f.Close()
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
				continue
			}
			k, v, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			key := strings.TrimSpace(k)
			val := strings.Trim(strings.TrimSpace(v), `"'`)
			if key == "" || val == "" {
				continue
			}
			internalName := ""
			switch {
			case strings.HasPrefix(key, "item_Name_"):
				internalName = key[len("item_Name_"):]
			case strings.HasPrefix(key, "item_Name"):
				internalName = key[len("item_Name"):]
			case strings.HasSuffix(key, "_Name"):
				internalName = key[:len(key)-len("_Name")]
			}
			if internalName == "" {
				continue
			}
			internalName = lookup.CanonicalInternalKey(internalName)
			valLower := strings.ToLower(val)
			list := localMap[valLower]
			found := false
			for _, existing := range list {
				if existing == internalName {
					found = true
					break
				}
			}
			if !found {
				localMap[valLower] = append(list, internalName)
			}
		}
		return nil
	})
	return localMap
}

func CollectLogFiles(logDirs []string, includeGameLog bool) []string {
	var files []string
	seen := map[string]struct{}{}
	for _, d := range logDirs {
		fi, err := os.Stat(d)
		if err != nil || !fi.IsDir() {
			continue
		}
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".log") {
				continue
			}
			if !includeGameLog && e.Name() == "Game.log" {
				continue
			}
			p := filepath.Join(d, e.Name())
			resolved, err := filepath.Abs(p)
			if err != nil {
				resolved = p
			}
			if _, ok := seen[resolved]; ok {
				continue
			}
			seen[resolved] = struct{}{}
			files = append(files, p)
		}
	}
	return files
}

func FormatLogTS(ts float64) string {
	if ts <= 0 {
		return time.Now().Format("2006-01-02 15:04:05")
	}
	return time.Unix(int64(ts), 0).Local().Format("2006-01-02 15:04:05")
}
