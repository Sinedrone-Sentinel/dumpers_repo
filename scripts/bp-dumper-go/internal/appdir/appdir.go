package appdir

import (
	"os"
	"path/filepath"
	"strings"
)

// IsMsix reports Microsoft Store / MSIX packaging (WindowsApps or package family env).
func IsMsix() bool {
	if os.Getenv("PACKAGE_FAMILY_NAME") != "" || os.Getenv("MsixPackageFamilyName") != "" {
		return true
	}
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err == nil {
		exe = resolved
	}
	parts := strings.Split(strings.ToLower(exe), string(os.PathSeparator))
	for _, p := range parts {
		if p == "windowsapps" {
			return true
		}
	}
	return false
}

// Dir returns the directory that holds .env / .dumper_cache.json.
// Portable exe: beside the binary. Store/MSIX: %LOCALAPPDATA%\BP Dumper (WindowsApps is not writable).
func Dir() string {
	if IsMsix() {
		local := os.Getenv("LOCALAPPDATA")
		if local == "" {
			home, _ := os.UserHomeDir()
			local = filepath.Join(home, "AppData", "Local")
		}
		dir := filepath.Join(local, "BP Dumper")
		_ = os.MkdirAll(dir, 0o755)
		return dir
	}
	exe, err := os.Executable()
	if err != nil {
		wd, _ := os.Getwd()
		return wd
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err == nil {
		exe = resolved
	}
	return filepath.Dir(exe)
}
