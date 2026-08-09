//go:build !windows

package update

import (
	"fmt"
	"os"

	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/api"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/colors"
)

func PerformAutoUpdate(_, downloadURL string) {
	if downloadURL == "" {
		downloadURL = api.DefaultDownloadURL
	}
	fmt.Printf("%s[Update] Auto-update is Windows-only. Download: %s%s\n", colors.Yellow, downloadURL, colors.Reset)
	os.Exit(1)
}

func HandleUpdateRequired(err *api.UpdateRequiredError, currentVersion string, keepUpToDate bool) {
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
	_ = keepUpToDate
	fmt.Printf("%sDownload: %s%s\n", colors.Yellow, url, colors.Reset)
	os.Exit(1)
}
