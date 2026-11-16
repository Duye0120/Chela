//go:build !windows

package pet

// shortcut: fullscreen detection is Windows-only; validate an OS adapter before claiming another platform.
func systemPresence() (bool, bool) { return false, false }
