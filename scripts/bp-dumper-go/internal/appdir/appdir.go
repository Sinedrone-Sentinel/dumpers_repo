package appdir

import (
	"os"
	"path/filepath"
)

// Dir returns the directory that holds .env / .dumper_cache.json (beside the exe when built).
func Dir() string {
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
