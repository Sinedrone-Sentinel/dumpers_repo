//go:build !windows

package colors

func enableVT() error { return nil }
