//go:build windows

package update

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/api"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/colors"
)

func PerformAutoUpdate(latestVer, downloadURL string) {
	url := downloadURL
	if url == "" {
		url = api.DefaultDownloadURL
	}
	label := latestVer
	if label == "" {
		label = "latest"
	}
	fmt.Printf("\n%s[Update] Downloading BP Dumper %s...%s\n", colors.Cyan, label, colors.Reset)
	fmt.Printf("%s%s%s\n", colors.Dim, url, colors.Reset)

	exe, err := os.Executable()
	if err != nil {
		fmt.Printf("%s[Update] Cannot resolve executable path: %v%s\n", colors.Red, err, colors.Reset)
		os.Exit(1)
	}
	exe, _ = filepath.Abs(exe)
	tmpPath := exe + ".new"

	client := &http.Client{Timeout: 120 * time.Second}
	res, err := client.Get(url)
	if err != nil {
		fmt.Printf("%s[Update] Download failed: %v%s\n", colors.Red, err, colors.Reset)
		fmt.Printf("%sDownload manually: %s%s\n", colors.Yellow, url, colors.Reset)
		os.Exit(1)
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 200<<20))
	if err != nil || len(data) < 1_000_000 {
		fmt.Printf("%s[Update] Download too small or failed (%d bytes)%s\n", colors.Red, len(data), colors.Reset)
		fmt.Printf("%sDownload manually: %s%s\n", colors.Yellow, url, colors.Reset)
		os.Exit(1)
	}
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		fmt.Printf("%s[Update] Write failed: %v%s\n", colors.Red, err, colors.Reset)
		os.Exit(1)
	}

	helper := filepath.Join(filepath.Dir(exe), "_dumper_update.cmd")
	pid := os.Getpid()
	script := fmt.Sprintf(
		"@echo off\r\nsetlocal\r\nset PID=%d\r\nset EXE=%s\r\nset NEW=%s\r\n:wait\r\ntimeout /t 1 /nobreak >nul\r\ntasklist /FI \"PID eq %%PID%%\" 2>nul | find \"%%PID%%\" >nul\r\nif not errorlevel 1 goto wait\r\nmove /Y \"%%NEW%%\" \"%%EXE%%\" >nul\r\nstart \"\" \"%%EXE%%\"\r\ndel \"%%~f0\"\r\n",
		pid, exe, tmpPath,
	)
	if err := os.WriteFile(helper, []byte(script), 0o644); err != nil {
		fmt.Printf("%s[Update] Helper write failed: %v%s\n", colors.Red, err, colors.Reset)
		os.Exit(1)
	}
	fmt.Printf("%s[Update] Restarting with %s...%s\n", colors.Green, label, colors.Reset)
	_ = exec.Command("cmd", "/c", helper).Start()
	os.Exit(0)
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
	if keepUpToDate {
		PerformAutoUpdate(err.Latest, url)
	}
	fmt.Printf("%sKeep App Up to Date is off — download and run:%s\n", colors.Yellow, colors.Reset)
	fmt.Printf("  %s\n", url)
	fmt.Printf("  Releases: %s\n", api.DefaultReleasesURL)
	os.Exit(1)
}
