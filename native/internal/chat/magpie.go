package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

// Magpie owns the catalog; this is only its last successfully read snapshot.
type magpieCatalog struct {
	URL       string        `json:"url"`
	Secret    []byte        `json:"secret"`
	ETag      string        `json:"etag"`
	FetchedAt string        `json:"fetchedAt"`
	Models    []magpieModel `json:"models"`
}
type magpieModel struct {
	ID         string `json:"id"`
	Name       string `json:"display_name"`
	Context    int    `json:"context_window"`
	Output     int    `json:"max_output_tokens"`
	Reasoning  *bool  `json:"reasoning"`
	Tools      *bool  `json:"tool_call"`
	Modalities struct {
		Input  []string `json:"input"`
		Output []string `json:"output"`
	} `json:"modalities"`
	Efforts   []string          `json:"reasoning_levels"`
	Endpoints []string          `json:"native_endpoints"`
	Pricing   map[string]string `json:"pricing"`
}
type MagpieStatus struct {
	URL       string `json:"url"`
	FetchedAt string `json:"fetchedAt"`
	Count     int    `json:"count"`
	Stale     bool   `json:"stale"`
}

func modelEndpoint(endpoint string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimRight(strings.TrimSpace(endpoint), "/"))
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1"))) {
		return nil, errors.New("请输入 HTTPS 接口地址，本机服务可使用 HTTP")
	}
	return u, nil
}

func (c *Chat) ConnectMagpie(endpoint, key string) (MagpieStatus, error) {
	u, err := modelEndpoint(endpoint)
	if err != nil {
		return MagpieStatus{}, err
	}
	if !strings.HasSuffix(u.Path, "/v1") {
		u.Path = strings.TrimRight(u.Path, "/") + "/v1"
	}
	if key == "" {
		if u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1" {
			return MagpieStatus{}, errors.New("远程 Magpie 需要网关密钥")
		}
		key = "magpie-chela"
	}
	secret, err := seal([]byte(key))
	if err != nil {
		return MagpieStatus{}, err
	}
	cache := magpieCatalog{URL: u.String(), Secret: secret}
	if err := fetchMagpie(&cache, key); err != nil {
		return MagpieStatus{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := storage.WriteJSON(filepath.Join(c.profile, "magpie-catalog.json"), cache); err != nil {
		return MagpieStatus{}, err
	}
	return magpieStatus(cache), nil
}

func fetchMagpie(cache *magpieCatalog, key string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, cache.URL+"/models", nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+key)
	request.Header.Set("User-Agent", "Chela")
	if cache.ETag != "" {
		request.Header.Set("If-None-Match", cache.ETag)
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("模型目录重定向已拒绝") }}
	response, err := client.Do(request)
	if err != nil {
		return errors.New("无法连接 Magpie 网关，请确认网关已启动且地址正确")
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotModified && len(cache.Models) > 0 {
		cache.FetchedAt = storage.Now()
		return nil
	}
	if response.StatusCode != 200 {
		return fmt.Errorf("Magpie 目录请求失败（HTTP %d）", response.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 8*1024*1024+1))
	if err != nil {
		return err
	}
	if len(raw) > 8*1024*1024 {
		return errors.New("Magpie 目录超过大小限制")
	}
	var catalog struct {
		Data []magpieModel `json:"data"`
	}
	if err := json.Unmarshal(raw, &catalog); err != nil {
		return errors.New("Magpie 返回的模型目录不是有效 JSON")
	}
	if len(catalog.Data) == 0 {
		return errors.New("Magpie 当前没有可用模型")
	}
	seen := map[string]bool{}
	for _, model := range catalog.Data {
		if model.ID == "" || seen[model.ID] || model.Context < 0 || model.Output < 0 {
			return errors.New("Magpie 模型目录含无效或重复记录")
		}
		seen[model.ID] = true
	}
	cache.Models, cache.ETag, cache.FetchedAt = catalog.Data, response.Header.Get("ETag"), storage.Now()
	return nil
}

func (c *Chat) RefreshMagpie() (MagpieStatus, error) {
	c.mu.Lock()
	var cache magpieCatalog
	err := readOptional(filepath.Join(c.profile, "magpie-catalog.json"), &cache)
	c.mu.Unlock()
	if err != nil {
		return MagpieStatus{}, err
	}
	if cache.URL == "" {
		return MagpieStatus{}, errors.New("请先连接 Magpie")
	}
	key, err := unseal(cache.Secret)
	if err != nil {
		return MagpieStatus{}, err
	}
	if err := fetchMagpie(&cache, string(key)); err != nil {
		return magpieStatus(cache), err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	var current magpieCatalog
	if err := readOptional(filepath.Join(c.profile, "magpie-catalog.json"), &current); err != nil {
		return MagpieStatus{}, err
	}
	if current.URL != cache.URL || storage.Hash(current.Secret) != storage.Hash(cache.Secret) {
		return MagpieStatus{}, errors.New("连接已更改，请重新刷新目录")
	}
	if err := storage.WriteJSON(filepath.Join(c.profile, "magpie-catalog.json"), cache); err != nil {
		return MagpieStatus{}, err
	}
	return magpieStatus(cache), nil
}

func magpieStatus(cache magpieCatalog) MagpieStatus {
	when, err := time.Parse(time.RFC3339, cache.FetchedAt)
	return MagpieStatus{cache.URL, cache.FetchedAt, len(cache.Models), err != nil || time.Since(when) > 24*time.Hour}
}

func (c *Chat) MagpieStatus() (MagpieStatus, error) {
	var cache magpieCatalog
	err := readOptional(filepath.Join(c.profile, "magpie-catalog.json"), &cache)
	return magpieStatus(cache), err
}

func (c *Chat) magpieModels() (infos []modelInfo, configs map[string]modelConfig, err error) {
	var cache magpieCatalog
	if err = readOptional(filepath.Join(c.profile, "magpie-catalog.json"), &cache); err != nil {
		return
	}
	configs = map[string]modelConfig{}
	if cache.URL == "" {
		return
	}
	key, e := unseal(cache.Secret)
	if e != nil {
		err = e
		return
	}
	for _, m := range cache.Models {
		var vision *bool
		if m.Modalities.Input != nil {
			supported := false
			for _, kind := range m.Modalities.Input {
				if kind == "image" {
					supported = true
				}
			}
			vision = &supported
		}
		id := "magpie:" + m.ID
		label := m.Name
		if label == "" {
			label = m.ID
		}
		kind, base := "openai-compatible", cache.URL
		for _, endpoint := range m.Endpoints {
			if endpoint == "/v1/responses" {
				kind = "openai"
				break
			}
			if endpoint == "/v1/messages" {
				kind = "anthropic"
				base = strings.TrimSuffix(cache.URL, "/v1")
				break
			}
		}
		source, _ := json.Marshal(map[string]any{"id": "magpie", "name": "Magpie", "providerType": kind, "baseUrl": base})
		limits := map[string]int{}
		if m.Context > 0 {
			limits["contextWindow"] = m.Context
		}
		if m.Output > 0 {
			limits["maxOutputTokens"] = m.Output
		}
		entry, _ := json.Marshal(map[string]any{"id": id, "name": label, "modelId": m.ID, "capabilities": map[string]any{}, "detectedCapabilities": map[string]any{"reasoning": m.Reasoning, "toolCalling": m.Tools, "vision": vision}, "limits": limits, "detectedLimits": map[string]int{}, "providerOptions": map[string]any{"pricing": m.Pricing, "compat": map[string]any{"supportsReasoningEffort": true}}})
		configs[id] = modelConfig{source, entry, string(key)}
		infos = append(infos, modelInfo{ID: id, Label: label, Provider: "Magpie", Reasoning: m.Reasoning != nil && *m.Reasoning, Efforts: m.Efforts, ContextWindow: m.Context, MaxOutputTokens: m.Output, Source: "Magpie", FetchedAt: cache.FetchedAt, Stale: magpieStatus(cache).Stale})
	}
	return
}
