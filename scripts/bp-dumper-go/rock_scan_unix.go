//go:build !windows

package main

import (
	"fmt"
	"os"
)

func runRockScanTest(_ []string) int {
	fmt.Fprintf(os.Stderr, "Rock scan OCR test is Windows-only (game window capture + SC_OCR).\n")
	return 1
}
