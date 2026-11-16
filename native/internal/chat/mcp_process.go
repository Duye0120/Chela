package chat

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

type mcpReply struct {
	Token  string          `json:"token"`
	ID     string          `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  string          `json:"error"`
}
type mcpProcess struct {
	cmd     *exec.Cmd
	input   io.WriteCloser
	token   string
	writeMu sync.Mutex
	mu      sync.Mutex
	pending map[string]chan mcpReply
	done    chan struct{}
	problem error
}
type mcpSlot struct {
	once     sync.Once
	process  *mcpProcess
	err      error
	revision int64
}

func baseMCPEnvironment() []string {
	result := []string{}
	for _, name := range []string{"PATH", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOME"} {
		if value, ok := os.LookupEnv(name); ok {
			result = append(result, name+"="+value)
		}
	}
	return result
}
func startMCPProcess(directory string) (*mcpProcess, error) {
	p := &mcpProcess{token: rand.Text(), pending: map[string]chan mcpReply{}, done: make(chan struct{})}
	p.cmd = exec.Command(filepath.Join(directory, "node.exe"), filepath.Join(directory, "mcp.cjs"))
	p.cmd.SysProcAttr = piProcessAttrs
	p.cmd.Env = append(baseMCPEnvironment(), "CHELA_MCP_TOKEN="+p.token)
	var err error
	p.input, err = p.cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	output, err := p.cmd.StdoutPipe()
	if err != nil {
		p.input.Close()
		return nil, err
	}
	if err = p.cmd.Start(); err != nil {
		p.input.Close()
		output.Close()
		return nil, err
	}
	release, err := containPiProcess(p.cmd)
	if err != nil {
		p.cmd.Process.Kill()
		p.input.Close()
		p.cmd.Wait()
		return nil, err
	}
	go func() {
		defer close(p.done)
		defer release()
		scan := bufio.NewScanner(output)
		scan.Buffer(make([]byte, 65536), 1024*1024)
		for scan.Scan() {
			var reply mcpReply
			if json.Unmarshal(scan.Bytes(), &reply) != nil || reply.Token != p.token || reply.ID == "" {
				p.problem = errors.New("MCP 私有通道出现无效响应")
				break
			}
			p.mu.Lock()
			ch := p.pending[reply.ID]
			delete(p.pending, reply.ID)
			p.mu.Unlock()
			if ch != nil {
				ch <- reply
			}
		}
		p.cmd.Process.Kill()
		p.input.Close()
		err := p.cmd.Wait()
		if p.problem == nil {
			p.problem = scan.Err()
		}
		if p.problem == nil {
			p.problem = err
		}
		if p.problem == nil {
			p.problem = errors.New("MCP 连接进程已退出")
		}
	}()
	return p, nil
}
func (p *mcpProcess) send(id, method string, params any) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	return json.NewEncoder(p.input).Encode(map[string]any{"token": p.token, "id": id, "method": method, "params": params})
}
func (p *mcpProcess) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	id := rand.Text()
	reply := make(chan mcpReply, 1)
	p.mu.Lock()
	p.pending[id] = reply
	p.mu.Unlock()
	defer func() { p.mu.Lock(); delete(p.pending, id); p.mu.Unlock() }()
	if err := p.send(id, method, params); err != nil {
		return nil, err
	}
	select {
	case value := <-reply:
		if value.Error != "" {
			return nil, errors.New(value.Error)
		}
		return value.Result, nil
	case <-p.done:
		return nil, p.problem
	case <-ctx.Done():
		_ = p.send(id, "cancel", nil)
		return nil, ctx.Err()
	}
}
func (p *mcpProcess) stop() { _ = p.input.Close(); _ = p.cmd.Process.Kill(); <-p.done }
func (c *Chat) mcpConnection(ctx context.Context, id string) (*mcpProcess, MCPConfig, int64, error) {
	config, revision, enabled, err := c.readMCP(id)
	if err != nil {
		return nil, config, 0, err
	}
	if !enabled {
		return nil, config, 0, errors.New("MCP 连接未启用")
	}
	c.mcpMu.Lock()
	if c.mcpClients == nil {
		c.mcpClients = map[string]*mcpSlot{}
	}
	slot := c.mcpClients[id]
	if slot == nil {
		slot = &mcpSlot{revision: revision}
		c.mcpClients[id] = slot
	}
	c.mcpMu.Unlock()
	if slot.revision != revision {
		return nil, config, revision, errors.New("MCP 配置已变化，请在空闲时重连")
	}
	slot.once.Do(func() {
		exe, e := os.Executable()
		if e != nil {
			slot.err = e
			return
		}
		directory := filepath.Join(filepath.Dir(exe), "runtime")
		if c.runtimeDir != "" {
			directory = c.runtimeDir
		}
		p, e := startMCPProcess(directory)
		if e != nil {
			slot.err = e
			return
		}
		params := map[string]any{"id": id, "url": config.URL, "headers": config.Headers, "command": config.Command, "args": config.Args, "cwd": config.Cwd}
		env := map[string]string{}
		for _, pair := range baseMCPEnvironment() {
			k, v, ok := strings.Cut(pair, "=")
			if ok {
				env[k] = v
			}
		}
		for k, v := range config.Env {
			env[k] = v
		}
		params["env"] = env
		catalog, e := p.call(ctx, "connect", params)
		if e != nil {
			p.stop()
			slot.err = e
			return
		}
		slot.process = p
		slot.err = c.saveMCPCatalog(id, revision, catalog)
		if slot.err != nil {
			p.stop()
			slot.process = nil
		}
	})
	if slot.err != nil {
		c.mcpHealth(id, "failed", redactMCPError(slot.err.Error(), config))
		return nil, config, revision, errors.New(redactMCPError(slot.err.Error(), config))
	}
	select {
	case <-slot.process.done:
		return nil, config, revision, errors.New("MCP 连接已断开，请在空闲时重连")
	default:
		return slot.process, config, revision, nil
	}
}
