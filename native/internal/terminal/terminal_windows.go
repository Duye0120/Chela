package terminal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func init() {
	startTerminalProcess = startWindowsTerminal
	probeTerminal = func(program string) (string, error) {
		argv, err := terminalCommand(program)
		if err != nil {
			return "", err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		args := append(argv[1:], "--version")
		command := exec.CommandContext(ctx, argv[0], args...)
		command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		output, err := command.Output()
		if err != nil {
			return "", fmt.Errorf("无法核验 %s 版本: %w", program, err)
		}
		return strings.TrimSpace(string(output)), nil
	}
}

// Use the executable or npm's package entry directly, so cmd.exe never interprets paths.
func terminalCommand(program string) ([]string, error) {
	path, err := exec.LookPath(program)
	if err != nil {
		return nil, fmt.Errorf("找不到 %s，请检查本机安装和 PATH：%w", program, err)
	}
	if !filepath.IsAbs(path) {
		return nil, errors.New("终端程序的 PATH 条目必须是绝对路径")
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".exe":
		return []string{path}, nil
	case ".cmd", ".bat", ".ps1":
	default:
		return nil, fmt.Errorf("不支持的终端程序入口：%s", path)
	}
	pkg := map[string]string{"codex": "@openai/codex", "opencode": "opencode-ai"}[program]
	if pkg == "" {
		return nil, errors.New("找不到 pwsh.exe")
	}
	dir := filepath.Dir(path)
	pkgDir := filepath.Join(dir, "node_modules", pkg)
	data, err := os.ReadFile(filepath.Join(pkgDir, "package.json"))
	if err != nil {
		return nil, fmt.Errorf("无法读取 %s 的 npm 安装入口：%w", program, err)
	}
	var manifest struct{ Bin json.RawMessage }
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, err
	}
	var entry string
	if err := json.Unmarshal(manifest.Bin, &entry); err != nil {
		var entries map[string]string
		if err := json.Unmarshal(manifest.Bin, &entries); err != nil {
			return nil, err
		}
		entry = entries[program]
	}
	if !filepath.IsLocal(entry) {
		return nil, fmt.Errorf("%s 的 npm 安装入口无效", program)
	}
	entry = filepath.Join(pkgDir, entry)
	fi, err := os.Stat(entry)
	if err != nil {
		return nil, err
	}
	if !fi.Mode().IsRegular() {
		return nil, fmt.Errorf("%s 的 npm 安装入口必须是文件", program)
	}
	if strings.EqualFold(filepath.Ext(entry), ".exe") {
		return []string{entry}, nil
	}
	node := filepath.Join(dir, "node.exe")
	if _, err := os.Stat(node); errors.Is(err, os.ErrNotExist) {
		node, err = exec.LookPath("node.exe")
		if err != nil {
			return nil, err
		}
		if !filepath.IsAbs(node) {
			return nil, errors.New("Node.js 的 PATH 条目必须是绝对路径")
		}
	}
	return []string{node, entry}, nil
}

type windowsTerminal struct {
	mu      sync.Mutex
	console windows.Handle
	job     windows.Handle
	process windows.Handle
	input   *os.File
	drained chan struct{}
}

func startWindowsTerminal(program, directory string, output io.Writer) (_ terminalProcess, err error) {
	if len(filepath.VolumeName(directory)) != 2 {
		return nil, errors.New("请选择本机磁盘上的终端工作目录")
	}
	root, err := windows.UTF16PtrFromString(filepath.VolumeName(directory) + `\`)
	if err != nil {
		return nil, err
	}
	if windows.GetDriveType(root) == windows.DRIVE_REMOTE {
		return nil, errors.New("请选择本机磁盘上的终端工作目录")
	}
	fi, err := os.Stat(directory)
	if err != nil {
		return nil, err
	}
	if !fi.IsDir() {
		return nil, errors.New("终端工作目录必须是文件夹")
	}
	argv, err := terminalCommand(program)
	if err != nil {
		return nil, err
	}
	if err := windows.NewLazySystemDLL("kernel32.dll").NewProc("CreatePseudoConsole").Find(); err != nil {
		return nil, errors.New("当前 Windows 版本不支持 ConPTY")
	}
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
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		return nil, err
	}
	ptyIn, input, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	defer ptyIn.Close()
	defer func() {
		if err != nil {
			input.Close()
		}
	}()
	reader, ptyOut, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	defer ptyOut.Close()
	defer func() {
		if err != nil {
			reader.Close()
		}
	}()
	var console windows.Handle
	if err := windows.CreatePseudoConsole(windows.Coord{X: 80, Y: 24}, windows.Handle(ptyIn.Fd()), windows.Handle(ptyOut.Fd()), 0, &console); err != nil {
		return nil, err
	}
	process, err := startConsoleClient(argv, directory, console, job)
	if err != nil {
		windows.ClosePseudoConsole(console)
		return nil, err
	}
	p := &windowsTerminal{console: console, job: job, process: process, input: input, drained: make(chan struct{})}
	go func() {
		defer close(p.drained)
		defer reader.Close()
		io.Copy(output, reader)
	}()
	return p, nil
}

func startConsoleClient(argv []string, directory string, console, job windows.Handle) (windows.Handle, error) {
	attrs, err := windows.NewProcThreadAttributeList(2)
	if err != nil {
		return 0, err
	}
	defer attrs.Delete()
	if err := attrs.Update(windows.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, unsafe.Pointer(console), unsafe.Sizeof(console)); err != nil {
		return 0, err
	}
	// PROC_THREAD_ATTRIBUTE_JOB_LIST attaches the process before it can spawn children.
	const procThreadAttributeJobList = 0x0002000D
	if err := attrs.Update(procThreadAttributeJobList, unsafe.Pointer(&job), unsafe.Sizeof(job)); err != nil {
		return 0, err
	}
	exe, err := windows.UTF16PtrFromString(argv[0])
	if err != nil {
		return 0, err
	}
	command, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(argv))
	if err != nil {
		return 0, err
	}
	dir, err := windows.UTF16PtrFromString(directory)
	if err != nil {
		return 0, err
	}
	si := windows.StartupInfoEx{ProcThreadAttributeList: attrs.List()}
	si.Cb = uint32(unsafe.Sizeof(si))
	// Null standard handles let ConPTY attach them instead of inheriting redirected host pipes.
	si.Flags = windows.STARTF_USESTDHANDLES
	var pi windows.ProcessInformation
	if err := windows.CreateProcess(exe, command, nil, nil, false, windows.EXTENDED_STARTUPINFO_PRESENT, nil, dir, &si.StartupInfo, &pi); err != nil {
		return 0, err
	}
	windows.CloseHandle(pi.Thread)
	return pi.Process, nil
}

func (p *windowsTerminal) write(input string) error {
	_, err := io.WriteString(p.input, input)
	return err
}

func (p *windowsTerminal) resize(cols, rows int) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.console == 0 {
		return errors.New("终端已结束")
	}
	return windows.ResizePseudoConsole(p.console, windows.Coord{X: int16(cols), Y: int16(rows)})
}

func (p *windowsTerminal) stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.job != 0 {
		windows.CloseHandle(p.job)
		p.job = 0
	}
}

func (p *windowsTerminal) wait() (uint32, error) {
	_, err := windows.WaitForSingleObject(p.process, windows.INFINITE)
	var code uint32
	if err == nil {
		err = windows.GetExitCodeProcess(p.process, &code)
	}
	windows.CloseHandle(p.process)
	p.stop()
	p.mu.Lock()
	console := p.console
	p.console = 0
	p.mu.Unlock()
	windows.ClosePseudoConsole(console)
	p.input.Close()
	<-p.drained
	return code, err
}
