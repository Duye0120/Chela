package terminal

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
)

func TestOfficialResultIdentityResumeAndSeen(t *testing.T) {
	profile := t.TempDir()
	store := storage.New(profile)
	defer store.Close()
	w := work.New(profile, store)
	task, err := w.SaveTask(work.WorkTask{Title: "CLI 验证", Status: "进行中"})
	if err != nil {
		t.Fatal(err)
	}
	originalProbe, originalStart := probeTerminal, startObservedProcess
	defer func() { probeTerminal = originalProbe; startObservedProcess = originalStart }()
	probeTerminal = func(string) (string, error) { return "1.19.5", nil }
	pwsh, err := exec.LookPath("pwsh")
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	startObservedProcess = func(program, directory string, args []string, input string, line func([]byte) ([]byte, bool, error), output io.Writer) (terminalProcess, error) {
		calls++
		if program != "opencode" || input == "" {
			t.Fatal(program, input)
		}
		if calls == 2 && !strings.Contains(strings.Join(args, " "), "--session ses_fixture") {
			t.Fatal("resume lacks original id", args)
		}
		part := map[string]any{"id": fmt.Sprint("part_", calls), "type": "text", "sessionID": "ses_fixture", "messageID": fmt.Sprint("msg_", calls), "text": "done 只是回复，不是任务完成", "time": map[string]int{"end": 123}}
		raw, _ := json.Marshal(map[string]any{"type": "text", "sessionID": "ses_fixture", "part": part})
		encoded := base64.StdEncoding.EncodeToString(raw)
		script := "[Console]::In.ReadToEnd() | Out-Null; $r=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encoded + "')); [Console]::WriteLine($r); [Console]::WriteLine($r)"
		return startWindowsObserved([]string{pwsh, "-NoProfile", "-NonInteractive", "-Command", script}, directory, input, true, line, output)
	}
	term, stop := New(store)
	info, err := term.StartObserved("opencode", t.TempDir(), task.ID, "执行检查")
	if err != nil {
		t.Fatal(err)
	}
	wait := func() {
		s, e := term.session(info.ID)
		if e != nil {
			t.Fatal(e)
		}
		select {
		case <-s.done:
		case <-time.After(10 * time.Second):
			t.Fatal("pipe process stuck")
		}
	}
	wait()
	items, err := term.List()
	if err != nil || len(items) != 1 || !items[0].Observable || !items[0].Resumable {
		t.Fatal(items, err)
	}
	results, err := term.Results(info.ID)
	if err != nil || len(results) != 1 || results[0].Seen {
		t.Fatal(results, err)
	}
	tasks, _ := w.Tasks()
	if tasks[0].Status != "进行中" || !tasks[0].ReplyPending {
		t.Fatal(tasks)
	}
	if err = term.SeenResult(info.ID, results[0].Ref, results[0].Version); err != nil {
		t.Fatal(err)
	}
	if err = term.SeenResult(info.ID, results[0].Ref, results[0].Version); err != nil {
		t.Fatal(err)
	}
	tasks, _ = w.Tasks()
	if tasks[0].ReplyPending || tasks[0].Status != "进行中" {
		t.Fatal(tasks)
	}
	stop()
	term, stop = New(store)
	defer stop()
	items, err = term.List()
	if err != nil || !items[0].Resumable {
		t.Fatal(items, err)
	}
	resumed, err := term.Resume(info.ID, "继续原现场")
	if err != nil || resumed.ID != info.ID || resumed.Generation != 2 {
		t.Fatal(resumed, err)
	}
	wait()
	results, err = term.Results(info.ID)
	if err != nil || len(results) != 2 {
		t.Fatal(results, err)
	}
	db, _ := store.DB()
	var terminals int
	if err = db.QueryRow("SELECT count(*) FROM terminal_sessions").Scan(&terminals); err != nil || terminals != 1 {
		t.Fatal(terminals, err)
	}
	probeTerminal = func(string) (string, error) { return "future-version", nil }
	if _, err = term.StartObserved("opencode", t.TempDir(), "", "test"); err == nil {
		t.Fatal("unknown version accepted")
	}
}

func TestCodexProtocolAndUnknownFormats(t *testing.T) {
	o := observer{program: "codex", directory: "C:/project", prompt: "你好", external: "thread-known", expected: "thread-known"}
	_, response, _, err := o.parse([]byte(`{"id":1,"result":{"userAgent":"codex"}}`))
	if err != nil || !strings.Contains(string(response), "thread/resume") {
		t.Fatal(string(response), err)
	}
	_, response, _, err = o.parse([]byte(`{"id":2,"result":{"thread":{"id":"thread-known"}}}`))
	if err != nil || !strings.Contains(string(response), "turn/start") {
		t.Fatal(string(response), err)
	}
	_, _, _, err = o.parse([]byte(`{"id":3,"result":{"turn":{"id":"turn-1"}}}`))
	if err != nil {
		t.Fatal(err)
	}
	e, _, done, err := o.parse([]byte(`{"method":"item/completed","params":{"threadId":"thread-known","turnId":"turn-1","item":{"type":"agentMessage","id":"reply-1","text":"完成"}}}`))
	if err != nil || done || e.Kind != "reply_available" || e.Reply != "reply-1" {
		t.Fatal(e, done, err)
	}
	e, response, _, err = o.parse([]byte(`{"id":7,"method":"item/commandExecution/requestApproval","params":{"threadId":"thread-known","turnId":"turn-1"}}`))
	if err != nil || e.Kind != "input_required" || !strings.Contains(string(response), "decline") {
		t.Fatal(e, string(response), err)
	}
	_, _, done, err = o.parse([]byte(`{"method":"turn/completed","params":{"threadId":"thread-known","turn":{"id":"turn-1","status":"completed"}}}`))
	if err != nil || !done {
		t.Fatal(done, err)
	}
	if _, _, _, err = o.parse([]byte(`{"method":"item/completed","params":{"threadId":"wrong","turnId":"turn-1","item":{"type":"agentMessage","id":"reply-2"}}}`)); err == nil {
		t.Fatal("cross-session reply accepted")
	}
	op := observer{program: "opencode"}
	if _, _, _, err = op.parse([]byte(`{"type":"future","sessionID":"ses_unknown"}`)); err == nil {
		t.Fatal("unknown format accepted")
	}
}

func TestInstalledCodexHandshake(t *testing.T) {
	version, err := probeTerminal("codex")
	if err != nil || !observedVersion("codex", version) {
		t.Skip("verified Codex build not installed")
	}
	argv, err := terminalCommand("codex")
	if err != nil {
		t.Fatal(err)
	}
	accepted := make(chan bool, 1)
	o := observer{program: "codex"}
	proc, err := startWindowsObserved(append(argv, "app-server"), t.TempDir(), o.initial(), false, func(raw []byte) ([]byte, bool, error) {
		var v struct {
			ID     int
			Result struct{ UserAgent string }
			Error  json.RawMessage
		}
		if e := json.Unmarshal(raw, &v); e != nil {
			return nil, true, e
		}
		if v.ID == 1 {
			accepted <- v.Result.UserAgent != ""
			return nil, true, nil
		}
		return nil, false, nil
	}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer proc.stop()
	done := make(chan error, 1)
	go func() { _, e := proc.wait(); done <- e }()
	select {
	case ok := <-accepted:
		if !ok {
			t.Fatal("initialize rejected")
		}
	case <-time.After(15 * time.Second):
		t.Fatal("initialize timeout")
	}
	select {
	case e := <-done:
		if e != nil {
			t.Fatal(e)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("app-server did not stop on input close")
	}
}

func TestConPTYArchiveAndTaskIsolation(t *testing.T) {
	profile := t.TempDir()
	store := storage.New(profile)
	defer store.Close()
	w := work.New(profile, store)
	task, err := w.SaveTask(work.WorkTask{Title: "终端测试", Status: "进行中"})
	if err != nil {
		t.Fatal(err)
	}
	term, stop := New(store)
	defer stop()
	info, err := term.Start("pwsh", t.TempDir(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = term.Resize(info.ID, 100, 28); err != nil {
		t.Fatal(err)
	}
	if err = term.Write(info.ID, "[Console]::WriteLine('chela-中文-done'); exit 7\r"); err != nil {
		t.Fatal(err)
	}
	s, err := term.session(info.ID)
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-s.done:
	case <-time.After(15 * time.Second):
		t.Fatal("PTY did not end")
	}
	items, err := term.List()
	if err != nil || len(items) != 1 || items[0].ExitCode == nil || *items[0].ExitCode != 7 {
		var code uint32
		if len(items) > 0 && items[0].ExitCode != nil {
			code = *items[0].ExitCode
		}
		output, _ := term.Read(info.ID, 0)
		data, _ := base64.StdEncoding.DecodeString(output.Data)
		t.Fatalf("exit: %+v code=%d %v output=%q", items, code, err, string(data))
	}
	output, err := term.Read(info.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := base64.StdEncoding.DecodeString(output.Data)
	if !strings.Contains(string(data), "chela-中文-done") || output.PersistenceError != "" {
		t.Fatalf("output %+v %q", output, string(data))
	}
	tasks, err := w.Tasks()
	if err != nil || tasks[0].Status != "进行中" {
		t.Fatalf("exit completed task: %+v %v", tasks, err)
	}
	stop()
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := storage.New(profile)
	defer reopened.Close()
	restored, stopRestored := New(reopened)
	defer stopRestored()
	items, err = restored.List()
	if err != nil || len(items) != 1 || items[0].ID != info.ID || !items[0].Ended {
		t.Fatalf("restart %+v %v", items, err)
	}
	archived, err := restored.Read(info.ID, 0)
	if err != nil || archived.Data != output.Data {
		t.Fatalf("archive lost: %v", err)
	}
	if err = restored.Write(info.ID, "unexpected"); err == nil {
		t.Fatal("archive accepted input")
	}
	if err = restored.Close(info.ID); err != nil {
		t.Fatal(err)
	}
	items, _ = restored.List()
	if len(items) != 1 {
		t.Fatal("close erased original terminal")
	}
}
