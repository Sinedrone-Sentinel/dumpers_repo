package lookup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type Entry struct {
	OK            bool
	InternalName  string
	BlueprintName string
	Error         string
	DisplayName   string
}

type displayEntry struct {
	Ambiguous    bool           `json:"ambiguous"`
	DisplayName  string         `json:"displayName"`
	InternalName string         `json:"internalName"`
	BlueprintName string        `json:"blueprintName"`
	CategoryName string         `json:"categoryName"`
	Candidates   []displayEntry `json:"candidates"`
}

type Data struct {
	ByInternalName         map[string]map[string]any `json:"byInternalName"`
	ByDisplayName          map[string]displayEntry   `json:"byDisplayName"`
	ByContractDefinitionId map[string][]string       `json:"byContractDefinitionId"`
}

var (
	gradePrefixRE = regexp.MustCompile(`(?i)^(?:civ|ind|mil|ste|com)/[0-9]/[a-d]\s+`)
	gradeSizeRE   = regexp.MustCompile(`(?i)^(?:civ|ind|mil|ste|com)/([0-9])/[a-d]\s+`)
	s00RE         = regexp.MustCompile(`(?i)^s00\s+(.+)$`)
	sizeRE        = regexp.MustCompile(`(?i)^s(\d+)\s+(.+)$`)

	starstringsAliases = map[string]string{
		"lawson mining laser": "klein-sv mining laser",
		"pitman mining laser": "mining laser drak golem s1",
	}
	abbreviatedMiningPrefixes = map[string]string{
		"helix":    "mining_laser_thcn_helix",
		"hofstede": "mining_laser_shin_hofstede",
		"klein":    "mining_laser_shin_klein",
		"lawson":   "mining_laser_shin_klein",
		"pitman":   "mining_laser_drak_golem",
		"golem":    "mining_laser_drak_golem",
	}
)

func Load(embedded []byte, besideExeDir string) (*Data, error) {
	// Prefer lookup.json beside the exe (or cwd), then embed.
	candidates := []string{
		filepath.Join(besideExeDir, "lookup.json"),
		"lookup.json",
	}
	for _, p := range candidates {
		b, err := os.ReadFile(p)
		if err == nil && len(b) > 0 {
			return Parse(b)
		}
	}
	return Parse(embedded)
}

func Parse(b []byte) (*Data, error) {
	var d Data
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, err
	}
	if d.ByInternalName == nil {
		d.ByInternalName = map[string]map[string]any{}
	}
	if d.ByDisplayName == nil {
		d.ByDisplayName = map[string]displayEntry{}
	}
	if d.ByContractDefinitionId == nil {
		d.ByContractDefinitionId = map[string][]string{}
	}
	return &d, nil
}

func NormalizeDisplayKey(value string) string {
	val := strings.TrimSpace(strings.ToLower(value))
	val = gradePrefixRE.ReplaceAllString(val, "")
	return strings.TrimSpace(val)
}

func NormalizeInternalKey(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(strings.ReplaceAll(raw, `\`, `/`)))
	if strings.HasSuffix(normalized, ",p") {
		normalized = normalized[:len(normalized)-2]
	}
	if strings.HasPrefix(normalized, "bp_craft_") {
		normalized = normalized[len("bp_craft_"):]
	}
	switch {
	case strings.HasSuffix(normalized, "_scitem.json"):
		normalized = normalized[:len(normalized)-len("_scitem.json")]
	case strings.HasSuffix(normalized, ".json"):
		normalized = normalized[:len(normalized)-len(".json")]
	case strings.HasSuffix(normalized, "_scitem"):
		normalized = normalized[:len(normalized)-len("_scitem")]
	}
	return normalized
}

func CanonicalInternalKey(raw string) string {
	normalized := NormalizeInternalKey(raw)
	if strings.HasPrefix(normalized, "scitem_") {
		return normalized[len("scitem_"):]
	}
	return normalized
}

func (d *Data) resolveFromInternal(internalKey string) *Entry {
	entry, ok := d.ByInternalName[internalKey]
	if !ok || entry == nil {
		return nil
	}
	bpName := internalKey
	if v, ok := entry["blueprintName"].(string); ok && v != "" {
		bpName = v
	}
	return &Entry{OK: true, InternalName: internalKey, BlueprintName: bpName}
}

func (d *Data) tryAbbreviatedMining(text string) *Entry {
	trimmed := strings.TrimSpace(text)
	var size int
	var product string
	if m := s00RE.FindStringSubmatch(trimmed); m != nil {
		size = 0
		product = strings.ToLower(strings.TrimSpace(m[1]))
	} else if m := sizeRE.FindStringSubmatch(trimmed); m != nil {
		n, err := strconv.Atoi(m[1])
		if err != nil {
			return nil
		}
		size = n
		product = strings.ToLower(strings.TrimSpace(m[2]))
	} else {
		return nil
	}
	prefix, ok := abbreviatedMiningPrefixes[product]
	if !ok {
		return nil
	}
	return d.resolveFromInternal(prefix + "_s" + strconv.Itoa(size))
}

func (d *Data) tryStarstringsAlias(text string) *Entry {
	aliasKey, ok := starstringsAliases[NormalizeDisplayKey(text)]
	if !ok {
		return nil
	}
	de, ok := d.ByDisplayName[aliasKey]
	if !ok || de.Ambiguous || de.InternalName == "" {
		return nil
	}
	bp := de.BlueprintName
	if bp == "" {
		bp = text
	}
	return &Entry{OK: true, InternalName: de.InternalName, BlueprintName: bp}
}

func (d *Data) tryTokenSubset(text string) *Entry {
	queryTokens := strings.Fields(NormalizeDisplayKey(text))
	if len(queryTokens) < 3 {
		return nil
	}
	querySet := map[string]struct{}{}
	for _, t := range queryTokens {
		querySet[t] = struct{}{}
	}
	bestDelta := -1
	var matches []displayEntry
	for key, entry := range d.ByDisplayName {
		if entry.Ambiguous || entry.InternalName == "" {
			continue
		}
		displayTokens := strings.Fields(key)
		if len(displayTokens) < len(queryTokens) {
			continue
		}
		ok := true
		for t := range querySet {
			found := false
			for _, dt := range displayTokens {
				if dt == t {
					found = true
					break
				}
			}
			if !found {
				ok = false
				break
			}
		}
		if !ok {
			continue
		}
		delta := len(displayTokens) - len(queryTokens)
		if delta < 0 || delta > 1 {
			continue
		}
		if bestDelta < 0 || delta < bestDelta {
			bestDelta = delta
			matches = []displayEntry{entry}
		} else if delta == bestDelta {
			matches = append(matches, entry)
		}
	}
	if len(matches) != 1 {
		return nil
	}
	bp := matches[0].BlueprintName
	if bp == "" {
		bp = text
	}
	return &Entry{OK: true, InternalName: matches[0].InternalName, BlueprintName: bp}
}

func (d *Data) Resolve(rawInput string, contractDefinitionID string) Entry {
	text := strings.TrimSpace(rawInput)
	if text == "" {
		return Entry{OK: false, Error: "unknown_blueprint"}
	}
	internalKey := CanonicalInternalKey(text)
	if m := d.resolveFromInternal(internalKey); m != nil {
		return *m
	}
	de, ok := d.ByDisplayName[NormalizeDisplayKey(text)]
	if !ok {
		if m := d.tryStarstringsAlias(text); m != nil {
			return *m
		}
		if m := d.tryAbbreviatedMining(text); m != nil {
			return *m
		}
		if m := d.tryTokenSubset(text); m != nil {
			return *m
		}
		return Entry{OK: false, Error: "unknown_blueprint", DisplayName: text}
	}
	if !de.Ambiguous {
		bp := de.BlueprintName
		if bp == "" {
			bp = text
		}
		return Entry{OK: true, InternalName: de.InternalName, BlueprintName: bp}
	}
	candidates := append([]displayEntry{}, de.Candidates...)
	if m := gradeSizeRE.FindStringSubmatch(text); m != nil {
		sizeDigit := m[1]
		filtered := candidates[:0]
		for _, c := range candidates {
			if strings.Contains(c.CategoryName, "S"+sizeDigit) {
				filtered = append(filtered, c)
			}
		}
		if len(filtered) > 0 {
			candidates = filtered
		}
	}
	contractKey := strings.ToLower(strings.TrimSpace(contractDefinitionID))
	if contractKey != "" {
		pool := map[string]struct{}{}
		for _, id := range d.ByContractDefinitionId[contractKey] {
			pool[id] = struct{}{}
		}
		if len(pool) > 0 {
			filtered := candidates[:0]
			for _, c := range candidates {
				if _, ok := pool[c.InternalName]; ok {
					filtered = append(filtered, c)
				}
			}
			if len(filtered) > 0 {
				candidates = filtered
			}
		}
	}
	if len(candidates) == 1 {
		c := candidates[0]
		bp := c.BlueprintName
		if bp == "" {
			bp = text
		}
		return Entry{OK: true, InternalName: c.InternalName, BlueprintName: bp}
	}
	displayName := de.DisplayName
	if displayName == "" {
		displayName = text
	}
	return Entry{OK: false, Error: "ambiguous_blueprint", DisplayName: displayName}
}

func (d *Data) CacheKey(rawInput string) string {
	r := d.Resolve(rawInput, "")
	if r.OK {
		return r.InternalName
	}
	return NormalizeInternalKey(rawInput)
}

func (d *Data) IsAcquired(acquired map[string]struct{}, rawInput string) bool {
	key := d.CacheKey(rawInput)
	if _, ok := acquired[key]; ok {
		return true
	}
	_, ok := acquired[rawInput]
	return ok
}

func (d *Data) RegisterCustomTranslations(translations map[string][]string) {
	for localizedName, internalNames := range translations {
		if len(internalNames) == 0 {
			continue
		}
		key := NormalizeDisplayKey(localizedName)
		if key == "" {
			continue
		}
		var valid []displayEntry
		for _, rawInternal := range internalNames {
			internalName := CanonicalInternalKey(rawInternal)
			entry, ok := d.ByInternalName[internalName]
			if !ok || entry == nil {
				continue
			}
			bpName := internalName
			if v, ok := entry["blueprintName"].(string); ok && v != "" {
				bpName = v
			}
			cat, _ := entry["categoryName"].(string)
			valid = append(valid, displayEntry{
				InternalName:  internalName,
				BlueprintName: bpName,
				CategoryName:  cat,
			})
		}
		if len(valid) == 0 {
			continue
		}
		if len(valid) == 1 {
			d.ByDisplayName[key] = valid[0]
		} else {
			d.ByDisplayName[key] = displayEntry{
				Ambiguous:   true,
				DisplayName: localizedName,
				Candidates:  valid,
			}
		}
	}
}

func HasGradePrefix(name string) bool {
	return gradePrefixRE.MatchString(strings.TrimSpace(name))
}
