package chat

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

var piProcessAttrs *syscall.SysProcAttr
var errWorkerExited = errors.New("Agent 执行进程已中断")
var containPiProcess = func(*exec.Cmd) (func(), error) { return func() {}, nil }

type piRun struct {
	context   bridgeContext
	done      chan struct{}
	final     agentEvent
	onDelta   func(agentEvent)
	onRequest func(agentEvent) (any, error)
}

type piWorker struct {
	id      string
	epoch   int64
	cmd     *exec.Cmd
	input   io.WriteCloser
	writeMu sync.Mutex
	mu      sync.Mutex
	run     *piRun
	done    chan struct{}
	ready   chan struct{}
	pending sync.WaitGroup
	err     error
}

func startPiWorker(dir string) (*piWorker, error) {
	id := rand.Text()
	cmd := exec.Command(filepath.Join(dir, "node.exe"), filepath.Join(dir, "chat.cjs"))
	cmd.SysProcAttr = piProcessAttrs
	cmd.Env = append(os.Environ(), "CHELA_WORKER_ID="+id)
	input, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	output, err := cmd.StdoutPipe()
	if err != nil {
		input.Close()
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		input.Close()
		output.Close()
		return nil, fmt.Errorf("启动 Chela Agent 失败: %w", err)
	}
	release, err := containPiProcess(cmd)
	if err != nil {
		cmd.Process.Kill()
		input.Close()
		cmd.Wait()
		return nil, err
	}
	w := &piWorker{id: id, epoch: 1, cmd: cmd, input: input, done: make(chan struct{}), ready: make(chan struct{})}
	go w.read(output, release)
	select {
	case <-w.ready:
		return w, nil
	case <-w.done:
		return nil, w.err
	case <-time.After(15 * time.Second):
		w.stop()
		<-w.done
		return nil, errors.New("Agent 握手超时")
	}
}

func (w *piWorker) stop() { _ = w.cmd.Process.Kill(); _ = w.input.Close() }

func (w *piWorker) send(ctx context.Context, kind, method, id string, bc bridgeContext, payload any, problem string) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	event := agentEvent{Protocol: 1, Kind: kind, Method: method, Worker: w.id, Epoch: w.epoch, RequestID: id, Correlation: bc.Run, Context: bc, Payload: raw, Error: problem}
	w.writeMu.Lock()
	defer w.writeMu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	select {
	case <-w.done:
		return w.err
	default:
	}
	if err := json.NewEncoder(w.input).Encode(event); err != nil {
		w.stop()
		return fmt.Errorf("发送 Agent 请求失败: %w", err)
	}
	return nil
}

func (w *piWorker) read(output io.Reader, release func()) {
	scanner := bufio.NewScanner(output)
	scanner.Buffer(make([]byte, 65536), 16*1024*1024)
	var problem error
	var seq int64
	ready := false
	for scanner.Scan() {
		var event agentEvent
		if json.Unmarshal(scanner.Bytes(), &event) != nil || event.Protocol != 1 || event.Worker != w.id || event.Epoch != w.epoch || event.Seq <= seq {
			problem = errors.New("无效的 Agent 协议或 stdout 污染")
			break
		}
		seq = event.Seq
		if !ready {
			var version struct {
				SDK string `json:"sdk_version"`
			}
			if event.Method != "worker.ready" || json.Unmarshal(event.Payload, &version) != nil || version.SDK != "1.5.2" {
				problem = errors.New("Agent SDK 版本不匹配")
				break
			}
			ready = true
			close(w.ready)
			continue
		}
		w.mu.Lock()
		run := w.run
		w.mu.Unlock()
		if run == nil || event.Context != run.context {
			problem = errors.New("Agent 事件运行身份不匹配")
			break
		}
		if event.Kind == "request" && event.RequestID != "" {
			w.pending.Add(1)
			go func() {
				defer w.pending.Done()
				result, err := run.onRequest(event)
				message := ""
				if err != nil {
					message = err.Error()
				}
				_ = w.send(context.Background(), "response", event.Method, event.RequestID, event.Context, result, message)
			}()
		} else if event.Kind == "event" && event.Method == "stream.delta" {
			run.onDelta(event)
		} else if event.Kind == "event" && (event.Method == "run.settled" || event.Method == "run.failed") {
			w.mu.Lock()
			w.run = nil
			w.mu.Unlock()
			run.final = event
			close(run.done)
		} else {
			problem = errors.New("Agent 事件类型不受支持")
			break
		}
	}
	if problem == nil {
		problem = scanner.Err()
	}
	w.stop()
	waitErr := w.cmd.Wait()
	release()
	if problem != nil {
		w.err = problem
	} else if waitErr != nil {
		w.err = fmt.Errorf("Agent 退出: %w", waitErr)
	} else {
		w.err = errors.New("Agent 意外退出")
	}
	w.err = fmt.Errorf("%w: %v", errWorkerExited, w.err)
	close(w.done)
}

func (c *Chat) piWorker(session string) (*piWorker, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return nil, errors.New("Chela Agent 已关闭")
	}
	if w := c.pool[session]; w != nil {
		select {
		case <-w.done:
			delete(c.pool, session)
		default:
			return w, nil
		}
	}
	for id, w := range c.pool {
		if c.sending[id] == nil {
			w.stop()
			<-w.done
			delete(c.pool, id)
			break
		}
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	w, err := startPiWorker(filepath.Join(filepath.Dir(exe), "runtime"))
	if err == nil {
		c.pool[session] = w
	}
	return w, err
}

func (c *Chat) shutdown() {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	c.closed = true
	c.stopLifetime()
	for _, g := range c.sending {
		g.cancel()
	}
	c.mu.Unlock()
	c.workers.Wait()
	c.mcpMu.Lock()
	for _, slot := range c.mcpClients {
		if slot.process != nil {
			slot.process.stop()
		}
	}
	c.mcpClients = nil
	c.mcpMu.Unlock()
	for _, w := range c.pool {
		w.stop()
		<-w.done
		w.pending.Wait()
	}
	_ = c.store.Close()
}
