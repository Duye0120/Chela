package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type ProviderInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Kind    string `json:"kind"`
	Models  int    `json:"models"`
	Enabled bool   `json:"enabled"`
	HasKey  bool   `json:"hasKey"`
}

func (c *Chat) providerOverrides() (map[string]bool, error) {
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query("SELECT preference_key,value_json FROM preferences WHERE assistant_id=? AND scope_type='assistant' AND scope_id=? AND preference_key LIKE 'provider.enabled.%'", assistant, assistant)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]bool{}
	for rows.Next() {
		var key, raw string
		var value bool
		if err = rows.Scan(&key, &raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &value); err != nil {
			return nil, err
		}
		result[strings.TrimPrefix(key, "provider.enabled.")] = value
	}
	return result, rows.Err()
}
func enabled(overrides map[string]bool, id string, fallback bool) bool {
	value, ok := overrides[id]
	if ok {
		return value
	}
	return fallback
}
func publicEndpoint(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	u.User = nil
	u.RawQuery = ""
	u.Fragment = ""
	return u.String()
}
func (c *Chat) Providers() ([]ProviderInfo, error) {
	overrides, err := c.providerOverrides()
	if err != nil {
		return nil, err
	}
	result := []ProviderInfo{}
	var sources []struct {
		ID, Name, BaseURL, ProviderType string
		Enabled                         bool
	}
	var entries []struct {
		SourceID string
		Enabled  bool
	}
	var credentials map[string]struct{ APIKey string }
	for name, out := range map[string]any{"provider-sources.json": &sources, "model-entries.json": &entries, "credentials.json": &credentials} {
		if err = readOptional(filepath.Join(c.config, name), out); err != nil {
			return nil, err
		}
	}
	for _, source := range sources {
		count := 0
		for _, entry := range entries {
			if entry.SourceID == source.ID && entry.Enabled {
				count++
			}
		}
		id := "source:" + source.ID
		result = append(result, ProviderInfo{id, source.Name, publicEndpoint(source.BaseURL), "imported", count, enabled(overrides, id, source.Enabled), credentials[source.ID].APIKey != ""})
	}
	var custom profileModel
	if err = readOptional(filepath.Join(c.profile, "chat-provider.json"), &custom); err != nil {
		return nil, err
	}
	if custom.Model != "" {
		key, err := unseal(custom.Secret)
		if err != nil {
			return nil, err
		}
		result = append(result, ProviderInfo{"chela-custom", "OpenAI / 兼容网关", custom.URL, "custom", 1, enabled(overrides, "chela-custom", true), len(key) > 0})
	}
	var magpie magpieCatalog
	if err = readOptional(filepath.Join(c.profile, "magpie-catalog.json"), &magpie); err != nil {
		return nil, err
	}
	if magpie.URL != "" {
		result = append(result, ProviderInfo{"magpie", "Magpie", magpie.URL, "magpie", len(magpie.Models), enabled(overrides, "magpie", true), len(magpie.Secret) > 0})
	}
	return result, nil
}
func (c *Chat) SetProviderEnabled(id, raw string) error {
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return errors.New("供应商状态无效")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.sending) > 0 {
		return errors.New("请先结束当前运行，再启停供应商")
	}
	providers, err := c.Providers()
	if err != nil {
		return err
	}
	exists := false
	for _, provider := range providers {
		if provider.ID == id {
			exists = true
		}
	}
	if !exists {
		return errors.New("供应商已不存在")
	}
	infos, _, _, _, err := c.catalog()
	if err != nil {
		return err
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return err
	}
	data, _ := json.Marshal(value)
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,'assistant',?,?,1,?,?) ON CONFLICT(assistant_id,scope_type,scope_id,preference_key) DO UPDATE SET revision=preferences.revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at`, assistant, assistant, "provider.enabled."+id, string(data), storage.Now())
		if err != nil {
			return err
		}
		if !value {
			for _, info := range infos {
				if info.ProviderID == id {
					encoded, _ := json.Marshal(info.ID)
					if _, err = tx.Exec("DELETE FROM preferences WHERE assistant_id=? AND scope_type='assistant' AND preference_key IN ('model.chat','model.compaction','model.consolidation','model.proactivity') AND value_json=?", assistant, string(encoded)); err != nil {
						return err
					}
				}
			}
		}
		return nil
	})
}
func (c *Chat) TestProvider(id string) (int64, error) {
	var address, key, kind string
	switch id {
	case "chela-custom":
		var value profileModel
		if err := readOptional(filepath.Join(c.profile, "chat-provider.json"), &value); err != nil {
			return 0, err
		}
		secret, err := unseal(value.Secret)
		if err != nil {
			return 0, err
		}
		address, key, kind = value.URL, string(secret), "openai-compatible"
	case "magpie":
		var value magpieCatalog
		if err := readOptional(filepath.Join(c.profile, "magpie-catalog.json"), &value); err != nil {
			return 0, err
		}
		secret, err := unseal(value.Secret)
		if err != nil {
			return 0, err
		}
		address, key, kind = value.URL, string(secret), "openai-compatible"
	default:
		var sources []struct{ ID, BaseURL, ProviderType string }
		var credentials map[string]struct{ APIKey string }
		if err := readOptional(filepath.Join(c.config, "provider-sources.json"), &sources); err != nil {
			return 0, err
		}
		if err := readOptional(filepath.Join(c.config, "credentials.json"), &credentials); err != nil {
			return 0, err
		}
		for _, source := range sources {
			if "source:"+source.ID == id {
				address, key, kind = source.BaseURL, credentials[source.ID].APIKey, source.ProviderType
				break
			}
		}
	}
	u, err := modelEndpoint(address)
	if err != nil {
		return 0, errors.New("供应商地址无效，无法测试连接")
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/models"
	if kind == "anthropic" && !strings.HasSuffix(strings.TrimSuffix(u.Path, "/models"), "/v1") {
		u.Path = strings.TrimSuffix(u.Path, "/models") + "/v1/models"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	request.Header.Set("User-Agent", "Chela")
	if key != "" {
		if kind == "anthropic" {
			request.Header.Set("x-api-key", key)
			request.Header.Set("anthropic-version", "2023-06-01")
		} else {
			request.Header.Set("Authorization", "Bearer "+key)
		}
	}
	start := time.Now()
	response, err := c.network.Client().Do(request)
	if err != nil {
		return 0, errors.New("连接失败，请检查接口、凭据或代理设置")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return 0, fmt.Errorf("模型目录接口返回 HTTP %d，未发送生成请求", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 1024*1024+1))
	if err != nil || len(data) > 1024*1024 || !json.Valid(data) {
		return 0, errors.New("接口没有返回有效的模型目录 JSON")
	}
	return time.Since(start).Milliseconds(), nil
}
