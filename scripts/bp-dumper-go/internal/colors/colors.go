package colors

import (
	"os"
	"runtime"
)

var (
	Green   = "\033[92m"
	Cyan    = "\033[96m"
	Yellow  = "\033[93m"
	Red     = "\033[91m"
	Magenta = "\033[95m"
	Dim     = "\033[2m"
	Reset   = "\033[0m"
)

func Disable() {
	Green, Cyan, Yellow, Red, Magenta, Dim, Reset = "", "", "", "", "", "", ""
}

func EnableWindowsANSI() {
	if runtime.GOOS != "windows" {
		return
	}
	// Best-effort; failures just leave colors as-is (often already enabled).
	_ = enableVT()
}

func MaybeDisableForNonTTY() {
	fi, err := os.Stdout.Stat()
	if err != nil || (fi.Mode()&os.ModeCharDevice) == 0 {
		Disable()
	}
}
