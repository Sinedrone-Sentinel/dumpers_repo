package cache

import (
	"encoding/json"
	"os"
	"sort"
)

func Load(path string) map[string]struct{} {
	out := map[string]struct{}{}
	b, err := os.ReadFile(path)
	if err != nil {
		return out
	}
	var list []string
	if err := json.Unmarshal(b, &list); err != nil {
		return out
	}
	for _, s := range list {
		out[s] = struct{}{}
	}
	return out
}

func Save(path string, set map[string]struct{}) {
	list := make([]string, 0, len(set))
	for k := range set {
		list = append(list, k)
	}
	sort.Strings(list)
	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(path, b, 0o644)
}
