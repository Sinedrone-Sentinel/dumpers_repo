package config

import (
	"bufio"
	"os"
	"strings"
)

func LoadEnvFile(path string) map[string]string {
	out := map[string]string{}
	f, err := os.Open(path)
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		v = strings.TrimSpace(v)
		v = strings.Trim(v, `"'`)
		out[strings.TrimSpace(k)] = v
	}
	return out
}

func SaveEnvFile(path string, variables map[string]string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.WriteString("# Saved Configuration Settings\n"); err != nil {
		return err
	}
	// Stable-ish order for readability
	keys := []string{
		"LOG_PATH",
		"SUPABASE_WEBHOOK_URL",
		"LOG_WATCHER_API_KEY",
		"IMPORT_OLD_LOGS",
		"FULL_HISTORY_IMPORT",
		"WATCH_MODE",
	}
	seen := map[string]bool{}
	for _, k := range keys {
		v := strings.TrimSpace(variables[k])
		v = strings.Trim(v, `"'`)
		if v == "" {
			continue
		}
		if _, err := f.WriteString(k + "=" + v + "\n"); err != nil {
			return err
		}
		seen[k] = true
	}
	for k, v := range variables {
		if seen[k] {
			continue
		}
		v = strings.TrimSpace(v)
		v = strings.Trim(v, `"'`)
		if v == "" {
			continue
		}
		if _, err := f.WriteString(k + "=" + v + "\n"); err != nil {
			return err
		}
	}
	return nil
}

func Truthy(raw string, defaultTrue bool) bool {
	v := strings.TrimSpace(strings.ToLower(raw))
	if v == "" {
		return defaultTrue
	}
	switch v {
	case "0", "false", "n", "no", "off":
		return false
	default:
		return true
	}
}
