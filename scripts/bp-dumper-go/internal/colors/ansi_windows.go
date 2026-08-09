//go:build windows

package colors

import "golang.org/x/sys/windows"

func enableVT() error {
	h := windows.Handle(windows.Stdout)
	var mode uint32
	if err := windows.GetConsoleMode(h, &mode); err != nil {
		return err
	}
	mode |= windows.ENABLE_VIRTUAL_TERMINAL_PROCESSING
	return windows.SetConsoleMode(h, mode)
}
