package chat

import (
	"golang.org/x/sys/windows"
	"unsafe"
)

func protect(data []byte, encrypt bool) ([]byte, error) {
	if len(data) == 0 {
		return nil, nil
	}
	in := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var out windows.DataBlob
	var err error
	if encrypt {
		err = windows.CryptProtectData(&in, nil, nil, 0, nil, 1, &out)
	} else {
		err = windows.CryptUnprotectData(&in, nil, nil, 0, nil, 1, &out)
	}
	if err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	return append([]byte(nil), unsafe.Slice(out.Data, out.Size)...), nil
}
func seal(b []byte) ([]byte, error)   { return protect(b, true) }
func unseal(b []byte) ([]byte, error) { return protect(b, false) }
