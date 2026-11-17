package chat

import (
	"encoding/json"
	"errors"
	"github.com/Duye0120/Chela/native/internal/storage"
	"os"
	"path/filepath"
	"strings"
)

type modelInfo struct {
	ID              string   `json:"id"`
	Label           string   `json:"label"`
	Provider        string   `json:"provider"`
	ProviderID      string   `json:"providerId"`
	Reasoning       bool     `json:"reasoning"`
	Vision          bool     `json:"vision"`
	Fast            bool     `json:"fast"`
	Efforts         []string `json:"efforts,omitempty"`
	ContextWindow   int      `json:"contextWindow,omitempty"`
	MaxOutputTokens int      `json:"maxOutputTokens,omitempty"`
	Source          string   `json:"source,omitempty"`
	FetchedAt       string   `json:"fetchedAt,omitempty"`
	Stale           bool     `json:"stale,omitempty"`
}
type modelConfig struct {
	Source json.RawMessage `json:"source"`
	Entry  json.RawMessage `json:"entry"`
	Key    string          `json:"key"`
}
type profileModel struct {
	URL    string `json:"url"`
	Model  string `json:"model"`
	Secret []byte `json:"secret"`
	Vision bool   `json:"vision,omitempty"`
	Fast   bool   `json:"fast,omitempty"`
}

func readOptional(path string, out any) error {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}
func (c *Chat) catalog() ([]modelInfo, map[string]modelConfig, string, string, error) {
	infos := []modelInfo{}
	overrides, err := c.providerOverrides()
	if err != nil {
		return nil, nil, "", "", err
	}
	configs := map[string]modelConfig{}
	var entries, sources []json.RawMessage
	var settings struct {
		ModelRouting  struct{ Chat struct{ ModelID string } }
		ThinkingLevel string
	}
	var credentials map[string]struct{ APIKey string }
	for name, out := range map[string]any{"provider-sources.json": &sources, "model-entries.json": &entries, "settings.json": &settings, "credentials.json": &credentials} {
		if err := readOptional(filepath.Join(c.config, name), out); err != nil {
			return nil, nil, "", "", err
		}
	}
	for _, src := range sources {
		var s struct {
			ID, Name, BaseURL string
			Enabled           bool
		}
		if err := json.Unmarshal(src, &s); err != nil {
			return nil, nil, "", "", err
		}
		if !enabled(overrides, "source:"+s.ID, s.Enabled) {
			continue
		}
		for _, raw := range entries {
			var e struct {
				ID, SourceID, Name string
				Enabled            bool
				ProviderOptions    struct {
					FastMode bool `json:"fastMode"`
				}
				Capabilities, DetectedCapabilities struct {
					Reasoning   *bool
					Embedding   *bool
					ImageOutput *bool
					Vision      *bool
				}
			}
			if err := json.Unmarshal(raw, &e); err != nil {
				return nil, nil, "", "", err
			}
			if !e.Enabled || s.ID != e.SourceID {
				continue
			}
			if (e.DetectedCapabilities.Embedding != nil && *e.DetectedCapabilities.Embedding) || (e.DetectedCapabilities.ImageOutput != nil && *e.DetectedCapabilities.ImageOutput) {
				continue
			}
			r := e.Capabilities.Reasoning
			if r == nil {
				r = e.DetectedCapabilities.Reasoning
			}
			configs[e.ID] = modelConfig{src, raw, credentials[s.ID].APIKey}
			vision := e.Capabilities.Vision
			if vision == nil {
				vision = e.DetectedCapabilities.Vision
			}
			infos = append(infos, modelInfo{ID: e.ID, Label: e.Name, Provider: s.Name, ProviderID: "source:" + s.ID, Reasoning: r != nil && *r, Vision: vision != nil && *vision, Fast: e.ProviderOptions.FastMode})
		}
	}
	var custom profileModel
	if err := readOptional(filepath.Join(c.profile, "chat-provider.json"), &custom); err != nil {
		return nil, nil, "", "", err
	}
	chosen := settings.ModelRouting.Chat.ModelID
	if custom.Model != "" && enabled(overrides, "chela-custom", true) {
		key, err := unseal(custom.Secret)
		if err != nil {
			return nil, nil, "", "", err
		}
		source, _ := json.Marshal(map[string]any{"id": "chela-custom", "name": "自定义", "providerType": "openai-compatible", "baseUrl": custom.URL})
		entry, _ := json.Marshal(map[string]any{"id": "chela-custom", "name": custom.Model, "modelId": custom.Model, "capabilities": map[string]bool{"vision": custom.Vision}, "detectedCapabilities": map[string]bool{}, "limits": map[string]int{}, "detectedLimits": map[string]int{}})
		chosen = "chela-custom"
		infos = append(infos, modelInfo{ID: chosen, Label: custom.Model, Provider: "自定义", ProviderID: "chela-custom", Reasoning: false, Vision: custom.Vision, Fast: custom.Fast, Source: "用户配置，窗口上限未声明"})
		configs[chosen] = modelConfig{source, entry, string(key)}
	}
	magpieInfos, magpieConfigs, err := c.magpieModels()
	if err != nil {
		return nil, nil, "", "", err
	}
	infos = append(infos, magpieInfos...)
	for id, cfg := range magpieConfigs {
		configs[id] = cfg
	}
	roles, err := c.ModelRoles()
	if err != nil {
		return nil, nil, "", "", err
	}
	if roles["chat"] != "" {
		chosen = roles["chat"]
	}
	if _, ok := configs[chosen]; !ok && len(infos) > 0 && roles["chat"] == "" {
		chosen = infos[0].ID
	}
	if len(infos) == 0 {
		chosen = ""
	}
	if roles["effort"] != "" {
		settings.ThinkingLevel = roles["effort"]
	}
	return infos, configs, chosen, settings.ThinkingLevel, nil
}

func (c *Chat) Configure(endpoint, model, key string) error {
	return c.configureModel(endpoint, model, key, false, false, false)
}

type CustomModel struct {
	URL    string `json:"url"`
	Model  string `json:"model"`
	Vision bool   `json:"vision"`
	Fast   bool   `json:"fast"`
	HasKey bool   `json:"hasKey"`
}

func (c *Chat) CustomModel() (CustomModel, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var value profileModel
	if err := readOptional(filepath.Join(c.profile, "chat-provider.json"), &value); err != nil {
		return CustomModel{}, err
	}
	if value.Model == "" {
		return CustomModel{}, nil
	}
	key, err := unseal(value.Secret)
	if err != nil {
		return CustomModel{}, err
	}
	return CustomModel{URL: value.URL, Model: value.Model, Vision: value.Vision, Fast: value.Fast, HasKey: len(key) > 0}, nil
}

func (c *Chat) ConfigureModel(raw string) error {
	if len(raw) > 64*1024 {
		return errors.New("模型配置过长")
	}
	var value struct {
		URL, Model, Key string
		Vision          bool
		KeepKey         bool
		Fast            bool
	}
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return err
	}
	return c.configureModel(value.URL, value.Model, value.Key, value.Vision, value.KeepKey, value.Fast)
}

func (c *Chat) configureModel(endpoint, model, key string, vision, keepKey, fast bool) error {
	u, err := modelEndpoint(endpoint)
	if err != nil {
		return err
	}
	model = strings.TrimSpace(model)
	if model == "" {
		return errors.New("请填写模型 ID")
	}
	secret, err := seal([]byte(strings.TrimSpace(key)))
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if keepKey && strings.TrimSpace(key) == "" {
		var current profileModel
		if err := readOptional(filepath.Join(c.profile, "chat-provider.json"), &current); err != nil {
			return err
		}
		if current.URL != strings.TrimRight(u.String(), "/") {
			return errors.New("接口地址已改变，请重新填写该地址的密钥")
		}
		secret = current.Secret
	}
	return storage.WriteJSON(filepath.Join(c.profile, "chat-provider.json"), profileModel{URL: strings.TrimRight(u.String(), "/"), Model: model, Secret: secret, Vision: vision, Fast: fast})
}
