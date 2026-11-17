package network

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func TestProxyRelayAndBoundaries(t *testing.T) {
	store := storage.New(t.TempDir())
	defer store.Close()
	service := New(store)
	defer service.Close()
	for _, value := range []Config{{"bad", ""}, {"custom", "file:///tmp/proxy"}, {"custom", "http://user:secret@proxy:8080"}, {"custom", "http://proxy:8080/path"}} {
		if _, err := Validate(value); err == nil {
			t.Fatal("accepted invalid proxy", value.Mode)
		}
	}
	if _, err := Validate(Config{"custom", "socks5://127.0.0.1:1080"}); err != nil {
		t.Fatal(err)
	}
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		body, _ := io.ReadAll(r.Body)
		if r.URL.Host != "model.invalid" || r.Header.Get("Authorization") != "Bearer fixture" || r.Header.Get("X-Chela-Token") != "" || string(body) != "proof" {
			t.Error("relay altered provider request")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: proof\n\n"))
	}))
	defer upstream.Close()
	if err := service.Save(Config{"custom", upstream.URL}); err != nil {
		t.Fatal(err)
	}
	address, token, err := service.Relay()
	if err != nil {
		t.Fatal(err)
	}
	headers, _ := json.Marshal(map[string]string{"Authorization": "Bearer fixture", "Content-Type": "application/json"})
	send := func(auth, origin string) int {
		r, _ := http.NewRequest(http.MethodPost, address, strings.NewReader("proof"))
		r.Header.Set("X-Chela-Target", "http://model.invalid/v1/chat/completions")
		r.Header.Set("X-Chela-Headers", string(headers))
		r.Header.Set("X-Chela-Token", auth)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		response, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		body, _ := io.ReadAll(response.Body)
		if response.StatusCode == 200 && string(body) != "data: proof\n\n" {
			t.Fatal("stream changed")
		}
		return response.StatusCode
	}
	if send("bad", "") != 403 || send(token, "https://foreign.invalid") != 403 || calls != 0 {
		t.Fatal("relay allowed foreign caller")
	}
	if send(token, "") != 200 || calls != 1 {
		t.Fatal("configured HTTP proxy not used")
	}
	loopback, _ := http.NewRequest(http.MethodGet, "http://127.0.0.1:3000", nil)
	value, err := proxy(Config{"custom", upstream.URL}, loopback)
	if err != nil || value != nil {
		t.Fatal("proxied local project page")
	}
}
