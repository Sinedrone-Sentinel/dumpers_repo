//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func runRockScanTest(extraArgs []string) int {
	script, err := resolveRockScanScript()
	if err != nil {
		fmt.Fprintf(os.Stderr, "%sRock scan test:%s %v\n", color.Red, color.Reset, err)
		return 1
	}

	python, err := resolvePython()
	if err != nil {
		fmt.Fprintf(os.Stderr, "%sRock scan test:%s %v\n", color.Red, color.Reset, err)
		return 1
	}

	var cmd *exec.Cmd
	if filepath.Base(python) == "py" || strings.HasSuffix(strings.ToLower(python), `\py.exe`) {
		cmd = exec.Command(python, append([]string{"-3", script}, extraArgs...)...)
	} else {
		cmd = exec.Command(python, append([]string{script}, extraArgs...)...)
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Dir = filepath.Dir(script)

	fmt.Printf("%sBP Dumper — rock scan OCR test (local only)%s\n", color.Cyan, color.Reset)
	fmt.Printf("%sScript:%s %s\n", color.Dim, color.Reset, script)
	fmt.Printf("%sPython:%s %s\n\n", color.Dim, color.Reset, python)

	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return exitErr.ExitCode()
		}
		fmt.Fprintf(os.Stderr, "%sRock scan test failed:%s %v\n", color.Red, color.Reset, err)
		return 1
	}
	return 0
}

func resolveRockScanScript() (string, error) {
	candidates := []string{}

	if exePath, err := os.Executable(); err == nil {
		base := filepath.Dir(exePath)
		candidates = append(candidates,
			filepath.Join(base, "rock_scan_test.py"),
			filepath.Join(base, "rock-scan-ocr", "rock_scan_test.py"),
			filepath.Join(base, "..", "rock-scan-ocr", "rock_scan_test.py"),
			filepath.Join(base, "..", "..", "rock-scan-ocr", "rock_scan_test.py"),
		)
	}

	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(cwd, "scripts", "rock-scan-ocr", "rock_scan_test.py"),
			filepath.Join(cwd, "rock-scan-ocr", "rock_scan_test.py"),
		)
	}

	for _, path := range candidates {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return filepath.Clean(path), nil
		}
	}
	return "", fmt.Errorf("rock_scan_test.py not found (run from repo or place script beside bp-dumper.exe)")
}

func resolvePython() (string, error) {
	if v := strings.TrimSpace(os.Getenv("BP_DUMPER_PYTHON")); v != "" {
		return v, nil
	}
	for _, name := range []string{"python", "python3"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	if path, err := exec.LookPath("py"); err == nil {
		return path, nil
	}
	return "", fmt.Errorf("python not found on PATH (set BP_DUMPER_PYTHON)")
}
