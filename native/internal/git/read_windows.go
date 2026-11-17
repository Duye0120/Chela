package git

import (
	"os/exec"
	"syscall"
)

func init() {
	configureProcess = func(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
}
