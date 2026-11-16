package chat

import (
	"os/exec"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

func init() {
	piProcessAttrs = &syscall.SysProcAttr{HideWindow: true}
	containPiProcess = func(cmd *exec.Cmd) (_ func(), err error) {
		job, err := windows.CreateJobObject(nil, nil)
		if err != nil {
			return nil, err
		}
		defer func() {
			if err != nil {
				windows.CloseHandle(job)
			}
		}()
		limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
		limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
		if _, err = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
			return nil, err
		}
		process, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(cmd.Process.Pid))
		if err != nil {
			return nil, err
		}
		defer windows.CloseHandle(process)
		if err = windows.AssignProcessToJobObject(job, process); err != nil {
			return nil, err
		}
		return func() { windows.CloseHandle(job) }, nil
	}
}
