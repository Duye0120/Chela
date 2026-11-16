package terminal

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

func init() {
	startObservedProcess = func(program, directory string, args []string, input string, line func([]byte) ([]byte, bool, error), output io.Writer) (terminalProcess, error) {
		argv, err := terminalCommand(program)
		if err != nil {
			return nil, err
		}
		return startWindowsObserved(append(argv, args...), directory, input, program == "opencode", line, output)
	}
}

type windowsObserved struct {
	mu           sync.Mutex
	process, job windows.Handle
	input        *os.File
	drained      chan struct{}
}

func (p *windowsObserved) write(string) error {
	return errors.New("结果模式不接受终端按键；本轮结束后可继续原会话")
}
func (p *windowsObserved) resize(int, int) error { return nil }
func (p *windowsObserved) stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.job != 0 {
		windows.CloseHandle(p.job)
		p.job = 0
	}
}
func (p *windowsObserved) wait() (uint32, error) {
	_, err := windows.WaitForSingleObject(p.process, windows.INFINITE)
	var code uint32
	if err == nil {
		err = windows.GetExitCodeProcess(p.process, &code)
	}
	windows.CloseHandle(p.process)
	p.stop()
	p.input.Close()
	<-p.drained
	return code, err
}

func startWindowsObserved(argv []string, directory, input string, closeInput bool, line func([]byte) ([]byte, bool, error), output io.Writer) (_ terminalProcess, err error) {
	childIn, stdin, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	defer childIn.Close()
	stdout, childOut, err := os.Pipe()
	if err != nil {
		stdin.Close()
		return nil, err
	}
	defer childOut.Close()
	stderr, childErr, err := os.Pipe()
	if err != nil {
		stdin.Close()
		stdout.Close()
		return nil, err
	}
	defer childErr.Close()
	defer func() {
		if err != nil {
			stdin.Close()
			stdout.Close()
			stderr.Close()
		}
	}()
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
	handles := []windows.Handle{windows.Handle(childIn.Fd()), windows.Handle(childOut.Fd()), windows.Handle(childErr.Fd())}
	for _, h := range handles {
		if err = windows.SetHandleInformation(h, windows.HANDLE_FLAG_INHERIT, windows.HANDLE_FLAG_INHERIT); err != nil {
			return nil, err
		}
	}
	attrs, err := windows.NewProcThreadAttributeList(2)
	if err != nil {
		return nil, err
	}
	defer attrs.Delete()
	if err = attrs.Update(windows.PROC_THREAD_ATTRIBUTE_HANDLE_LIST, unsafe.Pointer(&handles[0]), uintptr(len(handles))*unsafe.Sizeof(handles[0])); err != nil {
		return nil, err
	}
	const jobList = 0x0002000D
	if err = attrs.Update(jobList, unsafe.Pointer(&job), unsafe.Sizeof(job)); err != nil {
		return nil, err
	}
	exe, err := windows.UTF16PtrFromString(argv[0])
	if err != nil {
		return nil, err
	}
	command, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(argv))
	if err != nil {
		return nil, err
	}
	dir, err := windows.UTF16PtrFromString(directory)
	if err != nil {
		return nil, err
	}
	si := windows.StartupInfoEx{ProcThreadAttributeList: attrs.List()}
	si.Cb = uint32(unsafe.Sizeof(si))
	si.Flags = windows.STARTF_USESTDHANDLES
	si.StdInput = handles[0]
	si.StdOutput = handles[1]
	si.StdErr = handles[2]
	var pi windows.ProcessInformation
	if err = windows.CreateProcess(exe, command, nil, nil, true, windows.EXTENDED_STARTUPINFO_PRESENT|windows.CREATE_NO_WINDOW, nil, dir, &si.StartupInfo, &pi); err != nil {
		return nil, err
	}
	windows.CloseHandle(pi.Thread)
	p := &windowsObserved{process: pi.Process, job: job, input: stdin, drained: make(chan struct{})}
	var readers sync.WaitGroup
	readers.Add(2)
	go func() { defer readers.Done(); defer stderr.Close(); io.Copy(output, stderr) }()
	go func() {
		defer readers.Done()
		defer stdout.Close()
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 4096), 1<<20)
		for scanner.Scan() {
			response, done, e := line(append([]byte{}, scanner.Bytes()...))
			if e != nil {
				fmt.Fprintf(output, "\r\nCLI 事件保存或解析失败：%v\r\n", e)
				p.stop()
				return
			}
			if len(response) > 0 {
				if _, e = stdin.Write(response); e != nil {
					fmt.Fprintf(output, "\r\nCLI 协议回执失败：%v\r\n", e)
					p.stop()
					return
				}
			}
			if done {
				stdin.Close()
			}
		}
		if e := scanner.Err(); e != nil {
			fmt.Fprintf(output, "\r\nCLI 事件读取失败：%v\r\n", e)
			p.stop()
		}
	}()
	go func() { readers.Wait(); close(p.drained) }()
	go func() {
		if _, e := io.WriteString(stdin, input); e != nil {
			fmt.Fprintf(output, "\r\nCLI 输入失败：%v\r\n", e)
			p.stop()
		}
		if closeInput {
			stdin.Close()
		}
	}()
	return p, nil
}
