package terminal

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/egoist/mygo"
)

type terminalInfo struct {
	ID                string  `json:"id"`
	Program           string  `json:"program"`
	Directory         string  `json:"directory"`
	TaskID            string  `json:"taskId"`
	Ended             bool    `json:"ended"`
	State             string  `json:"state"`
	Version           string  `json:"version"`
	ExitCode          *uint32 `json:"exitCode"`
	Mode              string  `json:"mode"`
	Generation        int     `json:"generation"`
	ExternalSessionID string  `json:"externalSessionId"`
	Observable        bool    `json:"observable"`
	Resumable         bool    `json:"resumable"`
}

type terminalOutput struct {
	Data             string `json:"data"`
	Next             int64  `json:"next"`
	Ended            bool   `json:"ended"`
	Reset            bool   `json:"reset"`
	PersistenceError string `json:"persistenceError"`
}

type terminalProcess interface {
	write(string) error
	resize(int, int) error
	stop()
	wait() (uint32, error)
}

type terminalSession struct {
	mu             sync.Mutex
	info           terminalInfo
	process        terminalProcess
	output         []byte
	next           int64
	done           chan struct{}
	persistMu      sync.Mutex
	persistErr     string
	savedNext      int64
	savedState     string
	archivedOutput bool
}

// Each tab retains at most 1 MiB of raw VT output for reconnecting views.
func (s *terminalSession) Write(data []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.output = append(s.output, data...)
	if len(s.output) > 1<<20 {
		s.output = s.output[len(s.output)-(1<<20):]
	}
	s.next += int64(len(data))
	return len(data), nil
}

type Terminal struct {
	mu          sync.Mutex
	sessions    []*terminalSession
	quitting    bool
	store       *storage.Store
	initialized bool
	flushers    sync.WaitGroup
}

func New(store *storage.Store) (*Terminal, func()) {
	t := &Terminal{store: store}
	return t, t.shutdown
}

func (t *Terminal) List() ([]terminalInfo, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if err := t.initialize(); err != nil {
		return nil, err
	}
	list := make([]terminalInfo, 0, len(t.sessions))
	for _, s := range t.sessions {
		s.mu.Lock()
		list = append(list, s.info)
		s.mu.Unlock()
	}
	return list, nil
}

func (*Terminal) ChooseDirectory() (string, error) {
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{
		Parent: mygo.FocusedWindow(), Title: "选择终端工作目录", Directory: true,
	})
	if err != nil || len(paths) == 0 {
		return "", err
	}
	return paths[0], nil
}

func (t *Terminal) Start(program, directory, taskID string) (terminalInfo, error) {
	return t.launch(program, directory, taskID, "", "")
}
func (t *Terminal) StartObserved(program, directory, taskID, prompt string) (terminalInfo, error) {
	if strings.TrimSpace(prompt) == "" || len(prompt) > 64000 {
		return terminalInfo{}, errors.New("请填写 1–64000 字节的执行内容")
	}
	return t.launch(program, directory, taskID, prompt, "")
}
func (t *Terminal) Resume(id, prompt string) (terminalInfo, error) {
	if strings.TrimSpace(prompt) == "" || len(prompt) > 64000 {
		return terminalInfo{}, errors.New("请填写继续执行的内容")
	}
	s, err := t.session(id)
	if err != nil {
		return terminalInfo{}, err
	}
	s.mu.Lock()
	info := s.info
	s.mu.Unlock()
	if !info.Ended || !info.Resumable || info.ExternalSessionID == "" {
		return terminalInfo{}, errors.New("此现场没有可恢复的已知 CLI 会话")
	}
	<-s.done
	if _, err = t.Read(id, 0); err != nil {
		return terminalInfo{}, err
	}
	return t.launch(info.Program, info.Directory, info.TaskID, prompt, id)
}
func (t *Terminal) launch(program, directory, taskID, prompt, resume string) (terminalInfo, error) {
	if program != "pwsh" && program != "codex" && program != "opencode" {
		return terminalInfo{}, errors.New("不支持的终端程序")
	}
	if !filepath.IsAbs(directory) {
		return terminalInfo{}, errors.New("请选择终端工作目录的绝对路径")
	}
	directory = filepath.Clean(directory)
	if fi, err := os.Stat(directory); err != nil || !fi.IsDir() {
		return terminalInfo{}, errors.New("终端工作目录不存在或不是文件夹")
	}
	version, err := probeTerminal(program)
	if err != nil {
		return terminalInfo{}, err
	}
	if prompt != "" && !observedVersion(program, version) {
		return terminalInfo{}, errors.New("此 CLI 版本尚未核验结构化协议，请使用普通终端")
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.quitting {
		return terminalInfo{}, errors.New("Chela 正在退出")
	}
	if err := t.initialize(); err != nil {
		return terminalInfo{}, err
	}
	active := 0
	for _, session := range t.sessions {
		session.mu.Lock()
		if !session.info.Ended {
			active++
		}
		session.mu.Unlock()
	}
	if active >= 4 {
		return terminalInfo{}, errors.New("最多同时运行 4 个外部终端，请先结束一个终端")
	}
	info := terminalInfo{ID: rand.Text(), Program: program, Directory: directory, TaskID: taskID, State: "starting", Version: version, Mode: "terminal", Generation: 1}
	if prompt != "" {
		info.Mode = "observed"
	}
	s := &terminalSession{info: info, done: make(chan struct{})}
	index := -1
	if resume != "" {
		for i, old := range t.sessions {
			if old.info.ID == resume {
				index = i
				old.mu.Lock()
				if !old.info.Ended || !old.info.Resumable {
					old.mu.Unlock()
					return terminalInfo{}, errors.New("原现场已在运行或不能恢复")
				}
				s.info.ID = resume
				s.info.Generation = old.info.Generation + 1
				s.info.ExternalSessionID = old.info.ExternalSessionID
				s.output = append([]byte{}, old.output...)
				s.next = old.next
				old.mu.Unlock()
				break
			}
		}
		if index < 0 {
			return terminalInfo{}, errors.New("原现场不存在")
		}
		err = t.store.Update(context.Background(), func(tx *sql.Tx) error {
			r, e := tx.Exec("UPDATE terminal_sessions SET generation=?,process_state='starting',ended_at=NULL,exit_code=NULL,executor_version=? WHERE terminal_session_id=? AND generation=? AND process_state IN ('exited','interrupted')", s.info.Generation, version, resume, s.info.Generation-1)
			if e != nil {
				return e
			}
			n, _ := r.RowsAffected()
			if n != 1 {
				return errors.New("恢复现场版本已改变")
			}
			return nil
		})
	} else {
		err = t.recordStart(s.info)
	}
	if err != nil {
		return terminalInfo{}, err
	}
	if index < 0 {
		t.sessions = append(t.sessions, s)
	} else {
		t.sessions[index] = s
	}
	var proc terminalProcess
	if prompt == "" {
		proc, err = startTerminalProcess(program, directory, s)
	} else {
		proc, err = t.observe(s, prompt)
	}
	if err != nil {
		s.info.Ended = true
		s.info.State = "exited"
		close(s.done)
		if saveErr := t.checkpoint(s, true); saveErr != nil {
			return terminalInfo{}, errors.Join(err, saveErr)
		}
		return terminalInfo{}, err
	}
	s.mu.Lock()
	s.process = proc
	s.info.State = "running"
	info = s.info
	s.mu.Unlock()
	if err := t.checkpoint(s, false); err != nil {
		proc.stop()
		_, _ = proc.wait()
		s.info.Ended = true
		s.info.State = "exited"
		close(s.done)
		return terminalInfo{}, errors.Join(err, t.checkpoint(s, true))
	}
	t.flushers.Add(1)
	go func() {
		defer t.flushers.Done()
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-s.done:
				return
			case <-ticker.C:
				_ = t.checkpoint(s, false)
			}
		}
	}()
	go func() {
		code, err := s.process.wait()
		s.mu.Lock()
		s.info.Ended = true
		s.info.State = "exited"
		if err == nil {
			s.info.ExitCode = &code
		} else {
			s.persistErr = err.Error()
		}
		s.mu.Unlock()
		_ = t.checkpoint(s, true)
		close(s.done)
	}()
	return info, nil
}

var startTerminalProcess = func(string, string, io.Writer) (terminalProcess, error) {
	return nil, errors.New("本机交互终端需要 Windows ConPTY")
}

var probeTerminal = func(string) (string, error) { return "", errors.New("当前平台没有终端适配器") }

func (t *Terminal) session(id string) (*terminalSession, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if err := t.initialize(); err != nil {
		return nil, err
	}
	for _, s := range t.sessions {
		if s.info.ID == id {
			return s, nil
		}
	}
	return nil, errors.New("终端已关闭")
}

func (t *Terminal) Read(id string, offset int64) (terminalOutput, error) {
	s, err := t.session(id)
	if err != nil {
		return terminalOutput{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.archivedOutput {
		db, e := t.store.DB()
		if e != nil {
			return terminalOutput{}, e
		}
		if e = db.QueryRow("SELECT output FROM terminal_output WHERE terminal_session_id=?", id).Scan(&s.output); e != nil {
			return terminalOutput{}, e
		}
		s.archivedOutput = false
	}
	first := s.next - int64(len(s.output))
	reset := offset < first || offset > s.next
	if reset {
		offset = first
	}
	next := offset + min(s.next-offset, 64<<10)
	return terminalOutput{
		Data: base64.StdEncoding.EncodeToString(s.output[offset-first : next-first]),
		Next: next, Ended: s.info.Ended && next == s.next, Reset: reset, PersistenceError: s.persistErr,
	}, nil
}

func (t *Terminal) Write(id, input string) error {
	s, err := t.session(id)
	if err != nil {
		return err
	}
	if s.process == nil {
		return errors.New("这是已归档的终端输出，不能继续输入")
	}
	return s.process.write(input)
}

func (t *Terminal) Resize(id string, cols, rows int) error {
	if cols < 1 || cols > 32767 || rows < 1 || rows > 32767 {
		return errors.New("终端行列数超出范围")
	}
	s, err := t.session(id)
	if err != nil {
		return err
	}
	if s.process == nil {
		return nil
	}
	return s.process.resize(cols, rows)
}

func (t *Terminal) Close(id string) error {
	s, err := t.session(id)
	if err != nil {
		return err
	}
	if s.process != nil {
		s.process.stop()
	}
	<-s.done
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.persistErr != "" {
		return errors.New(s.persistErr)
	}
	return nil
}

func (t *Terminal) shutdown() {
	t.mu.Lock()
	t.quitting = true
	sessions := t.sessions
	t.sessions = nil
	t.mu.Unlock()
	for _, s := range sessions {
		if s.process != nil {
			s.process.stop()
		}
	}
	for _, s := range sessions {
		<-s.done
	}
	t.flushers.Wait()
}
