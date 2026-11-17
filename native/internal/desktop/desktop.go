// Package desktop connects Go services to the Electron host over private stdio.
package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strings"
	"sync"
	"time"
)

type message struct {
	ID     int64             `json:"id,omitempty"`
	HostID int64             `json:"hostId,omitempty"`
	Method string            `json:"method,omitempty"`
	Args   []json.RawMessage `json:"args,omitempty"`
	Value  json.RawMessage   `json:"value,omitempty"`
	Error  string            `json:"error,omitempty"`
}

type Bridge struct {
	mu      sync.Mutex
	out     *json.Encoder
	serial  int64
	pending map[int64]chan message
	closed  bool
}

var host *Bridge

func New(output io.Writer) *Bridge {
	b := &Bridge{out: json.NewEncoder(output), pending: make(map[int64]chan message)}
	host = b
	return b
}

// Invoke is only available inside the desktop service process, never a public port.
func Invoke(method string, result any, args ...any) error {
	if host == nil {
		return errors.New("此操作需要 Chela 桌面宿主")
	}
	return host.invoke(method, result, args...)
}

func (b *Bridge) invoke(method string, result any, args ...any) error {
	raw, err := json.Marshal(args)
	if err != nil {
		return err
	}
	var values []json.RawMessage
	if err = json.Unmarshal(raw, &values); err != nil {
		return err
	}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return errors.New("桌面宿主已断开")
	}
	b.serial++
	id := b.serial
	reply := make(chan message, 1)
	b.pending[id] = reply
	err = b.out.Encode(message{HostID: id, Method: method, Args: values})
	b.mu.Unlock()
	defer func() { b.mu.Lock(); delete(b.pending, id); b.mu.Unlock() }()
	if err != nil {
		return err
	}
	timer := time.NewTimer(5 * time.Minute)
	defer timer.Stop()
	select {
	case value := <-reply:
		if value.Error != "" {
			return errors.New(value.Error)
		}
		if result != nil {
			return json.Unmarshal(value.Value, result)
		}
		return nil
	case <-timer.C:
		return errors.New("桌面操作超时")
	}
}

func (b *Bridge) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return
	}
	b.closed = true
	for _, reply := range b.pending {
		reply <- message{Error: "桌面宿主已断开"}
	}
	b.pending = make(map[int64]chan message)
}

func (b *Bridge) Serve(ctx context.Context, input io.Reader, dispatch func(context.Context, string, []json.RawMessage) (any, error)) error {
	ctx, cancel := context.WithCancel(ctx)
	var requests sync.WaitGroup
	defer func() { cancel(); b.Close(); requests.Wait() }()
	in := json.NewDecoder(input)
	active := make(chan struct{}, 64)
	for {
		var request message
		if err := in.Decode(&request); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		if request.HostID != 0 {
			b.mu.Lock()
			if reply := b.pending[request.HostID]; reply != nil {
				reply <- request
				delete(b.pending, request.HostID)
			}
			b.mu.Unlock()
			continue
		}
		select {
		case active <- struct{}{}:
		default:
			b.mu.Lock()
			_ = b.out.Encode(message{ID: request.ID, Error: "桌面服务繁忙，请稍后重试"})
			b.mu.Unlock()
			continue
		}
		requests.Add(1)
		go func() {
			defer requests.Done()
			defer func() { <-active }()
			value, err := dispatch(ctx, request.Method, request.Args)
			raw, encodeErr := json.Marshal(value)
			if err == nil {
				err = encodeErr
			}
			reply := message{ID: request.ID, Value: raw}
			if err != nil {
				reply.Error = err.Error()
				reply.Value = nil
			}
			b.mu.Lock()
			_ = b.out.Encode(reply)
			b.mu.Unlock()
		}()
	}
}

// Dispatch preserves the exported Go service contracts, including context arguments.
func Dispatch(ctx context.Context, services map[string]any, method string, args []json.RawMessage) (value any, err error) {
	defer func() {
		if recover() != nil {
			value = nil
			err = errors.New("本地服务调用失败")
		}
	}()
	name, member, ok := strings.Cut(method, ".")
	service := services[name]
	if !ok || service == nil || member == "" || method == "Chat.Start" {
		return nil, errors.New("未知的服务方法")
	}
	fn := reflect.ValueOf(service).MethodByName(member)
	if !fn.IsValid() {
		return nil, errors.New("未知的服务方法")
	}
	t := fn.Type()
	values := make([]reflect.Value, 0, t.NumIn())
	offset := 0
	if t.NumIn() > 0 && t.In(0) == reflect.TypeFor[context.Context]() {
		values = append(values, reflect.ValueOf(ctx))
		offset = 1
	}
	if len(args) != t.NumIn()-offset {
		return nil, errors.New("服务参数数量无效")
	}
	for i, raw := range args {
		arg := reflect.New(t.In(i + offset))
		if err := json.Unmarshal(raw, arg.Interface()); err != nil {
			return nil, fmt.Errorf("参数 %d 无效: %w", i+1, err)
		}
		values = append(values, arg.Elem())
	}
	for _, result := range fn.Call(values) {
		if result.Type().Implements(reflect.TypeFor[error]()) {
			if !result.IsNil() {
				return nil, result.Interface().(error)
			}
		} else {
			value = result.Interface()
		}
	}
	return value, nil
}

func OpenPath(path string) error    { return Invoke("Shell.OpenPath", nil, path) }
func OpenExternal(url string) error { return Invoke("Shell.OpenExternal", nil, url) }
func ChooseDirectory(title string) ([]string, error) {
	var paths []string
	err := Invoke("Dialog.ChooseDirectory", &paths, title)
	return paths, err
}
