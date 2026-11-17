package network

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/egoist/mygo/netproxy"
)

type Config struct {
	Mode string `json:"mode"`
	URL  string `json:"url"`
}

func Validate(value Config) (Config, error) {
	if value.Mode != "system" && value.Mode != "direct" && value.Mode != "custom" {
		return value, errors.New("请选择系统、直连或自定义代理")
	}
	if value.URL != "" {
		u, err := url.Parse(strings.TrimSpace(value.URL))
		if err != nil || u.Opaque != "" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || (u.Scheme != "http" && u.Scheme != "https" && u.Scheme != "socks5") {
			return value, errors.New("代理地址应为 HTTP / HTTPS / SOCKS5 主机与端口，不含账号密码或路径")
		}
		value.URL = strings.TrimRight(u.String(), "/")
	}
	if value.Mode == "custom" && value.URL == "" {
		return value, errors.New("请填写自定义代理地址")
	}
	return value, nil
}

type Service struct {
	Store          *storage.Store
	mu             sync.Mutex
	server         *http.Server
	address, token string
	transport      *http.Transport
}

func New(store *storage.Store) *Service { return &Service{Store: store} }
func (s *Service) Settings() (Config, error) {
	value := Config{Mode: "system"}
	db, err := s.Store.DB()
	if err != nil {
		return value, err
	}
	assistant, err := s.Store.Identity()
	if err != nil {
		return value, err
	}
	var raw string
	err = db.QueryRow("SELECT value_json FROM preferences WHERE assistant_id=? AND scope_type='assistant' AND scope_id=? AND preference_key='network.proxy'", assistant, assistant).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return value, nil
	}
	if err != nil {
		return value, err
	}
	if err = json.Unmarshal([]byte(raw), &value); err != nil {
		return value, err
	}
	return Validate(value)
}
func (s *Service) Save(value Config) error {
	value, err := Validate(value)
	if err != nil {
		return err
	}
	assistant, err := s.Store.Identity()
	if err != nil {
		return err
	}
	raw, _ := json.Marshal(value)
	return s.Store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,'assistant',?,'network.proxy',1,?,?) ON CONFLICT(assistant_id,scope_type,scope_id,preference_key) DO UPDATE SET revision=preferences.revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at`, assistant, assistant, string(raw), storage.Now())
		return err
	})
}
func proxy(value Config, request *http.Request) (*url.URL, error) {
	host := request.URL.Hostname()
	ip := net.ParseIP(host)
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || (ip != nil && ip.IsLoopback()) {
		return nil, nil
	}
	if value.Mode == "direct" {
		return nil, nil
	}
	if value.Mode == "custom" {
		return url.Parse(value.URL)
	}
	return netproxy.Proxy(request)
}
func (s *Service) Transport() *http.Transport {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.transport == nil {
		s.transport = http.DefaultTransport.(*http.Transport).Clone()
		s.transport.Proxy = func(request *http.Request) (*url.URL, error) {
			cfg, err := s.Settings()
			if err != nil {
				return nil, err
			}
			return proxy(cfg, request)
		}
	}
	return s.transport
}
func (s *Service) Client() *http.Client {
	return &http.Client{Transport: s.Transport(), CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}
func (s *Service) Relay() (string, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.server != nil {
		return s.address, s.token, nil
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return "", "", err
	}
	s.address = "http://" + listener.Addr().String()
	s.token = rand.Text()
	s.server = &http.Server{Handler: http.HandlerFunc(s.relay), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 64 * 1024}
	go s.server.Serve(listener)
	return s.address, s.token, nil
}
func (s *Service) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.server != nil {
		_ = s.server.Close()
	}
	if s.transport != nil {
		s.transport.CloseIdleConnections()
	}
}
func hop(name string) bool {
	switch strings.ToLower(name) {
	case "host", "connection", "proxy-connection", "proxy-authorization", "transfer-encoding", "content-length", "keep-alive", "te", "trailer", "upgrade":
		return true
	}
	return false
}

type flushWriter struct{ http.ResponseWriter }

func (w flushWriter) Write(data []byte) (int, error) {
	n, err := w.ResponseWriter.Write(data)
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
	return n, err
}
func (s *Service) relay(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" || r.Header.Get("Origin") != "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Chela-Token")), []byte(s.token)) != 1 {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	target, err := url.Parse(r.Header.Get("X-Chela-Target"))
	if err != nil || target.Hostname() == "" || target.User != nil || target.Opaque != "" || (target.Scheme != "http" && target.Scheme != "https") {
		http.Error(w, "Invalid target", 400)
		return
	}
	var headers map[string]string
	if len(r.Header.Get("X-Chela-Headers")) > 32768 || json.Unmarshal([]byte(r.Header.Get("X-Chela-Headers")), &headers) != nil {
		http.Error(w, "Invalid headers", 400)
		return
	}
	request, err := http.NewRequestWithContext(r.Context(), r.Method, target.String(), http.MaxBytesReader(w, r.Body, 64*1024*1024))
	if err != nil {
		http.Error(w, "Invalid request", 400)
		return
	}
	for name, value := range headers {
		if !hop(name) && !strings.HasPrefix(strings.ToLower(name), "x-chela-") {
			request.Header.Set(name, value)
		}
	}
	response, err := s.Client().Do(request)
	if err != nil {
		http.Error(w, "Network request failed; check proxy settings", 502)
		return
	}
	defer response.Body.Close()
	for name, values := range response.Header {
		if !hop(name) {
			for _, value := range values {
				w.Header().Add(name, value)
			}
		}
	}
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(flushWriter{w}, response.Body)
}
