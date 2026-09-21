//go:build !windows

package singleinstance

// Acquire is a no-op on non-Windows: member DumperApps.exe is Windows-only.
func Acquire() error { return nil }
