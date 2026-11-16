package pet

import (
	"golang.org/x/sys/windows"
	"unsafe"
)

var queryNotificationState = windows.NewLazySystemDLL("shell32.dll").NewProc("SHQueryUserNotificationState")

func systemPresence() (locked, fullscreen bool) {
	var state uint32
	hresult, _, _ := queryNotificationState.Call(uintptr(unsafe.Pointer(&state)))
	if int32(hresult) < 0 {
		return true, true
	}
	return state == 1, state == 2 || state == 3 || state == 4 || state == 6
}
