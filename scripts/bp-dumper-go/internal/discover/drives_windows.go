//go:build windows

package discover

import (
	"golang.org/x/sys/windows"
)

func fixedDriveRoots() []string {
	var roots []string
	for c := 'A'; c <= 'Z'; c++ {
		root := string(c) + `:\`
		dt := windows.GetDriveType(windows.StringToUTF16Ptr(root))
		if dt == windows.DRIVE_FIXED {
			roots = append(roots, root)
		}
	}
	return roots
}
