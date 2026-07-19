// DumperApps.exe — portable Windows launcher for the bundled Python BP Dumper.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func main() {
	root, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Could not resolve launcher path: %v\n", err)
		waitForKey()
		os.Exit(1)
	}
	root = filepath.Dir(root)

	python := filepath.Join(root, "python", "python.exe")
	dumperDir := filepath.Join(root, "scripts", "bp-dumper-py")
	dumper := filepath.Join(dumperDir, "dumper.py")

	if _, err := os.Stat(python); err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] Bundled Python missing. Re-download Dumper Apps and extract the full folder.\n")
		waitForKey()
		os.Exit(1)
	}
	if _, err := os.Stat(dumper); err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] BP Dumper scripts missing next to this exe.\n")
		waitForKey()
		os.Exit(1)
	}

	cmd := exec.Command(python, dumper, "--watch")
	cmd.Dir = dumperDir
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: false}

	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "Dumper Apps exited with error: %v\n", err)
		waitForKey()
		os.Exit(1)
	}
}

func waitForKey() {
	fmt.Fprint(os.Stderr, "Press Enter to close...")
	_, _ = fmt.Scanln()
}
