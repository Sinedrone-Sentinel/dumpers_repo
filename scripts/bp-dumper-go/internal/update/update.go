package update

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"

	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/api"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/colors"
)

func pressAnyKeyToExit() {
	_ = os.Stdout.Sync()
	_ = os.Stderr.Sync()
	if runtime.GOOS == "windows" {
		// Native "Press any key to continue . . ." so double-click launches don't flash-close.
		cmd := exec.Command("cmd", "/c", "pause")
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err == nil {
			return
		}
	}
	fmt.Print("\nPress Enter to exit...")
	_, _ = bufio.NewReader(os.Stdin).ReadBytes('\n')
}

// HandleUpdateRequired tells the member to download manually.
// Auto-download / self-replace was removed — that path tripped AV heuristics (Wacatac / dropper ML).
func HandleUpdateRequired(err *api.UpdateRequiredError, currentVersion string) {
	latest := err.Latest
	if latest == "" {
		latest = "newer"
	}
	url := err.DownloadURL
	if url == "" {
		url = api.DefaultDownloadURL
	}
	fmt.Printf(
		"\n%s[Update required] This BP Dumper (%s) is outdated. Latest is %s.%s\n",
		colors.Red, currentVersion, latest, colors.Reset,
	)
	fmt.Printf("%sDownload the new DumperApps.exe from GitHub Releases and replace this file:%s\n", colors.Yellow, colors.Reset)
	fmt.Printf("  %s\n", url)
	fmt.Printf("  Releases: %s\n", api.DefaultReleasesURL)
	pressAnyKeyToExit()
	os.Exit(1)
}
