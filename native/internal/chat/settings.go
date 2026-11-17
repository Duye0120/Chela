package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/Duye0120/Chela/native/internal/desktop"
	"github.com/Duye0120/Chela/native/internal/storage"
)

type RuntimeSettings struct {
	Permission    string `json:"permission"`
	ProjectRules  bool   `json:"projectRules"`
	MemoryEnabled bool   `json:"memoryEnabled"`
	FastMode      bool   `json:"fastMode"`
}

func settingsIn(tx interface{ QueryRow(string, ...any) *sql.Row }, assistant, session string) (RuntimeSettings, error) {
	value := RuntimeSettings{Permission: "ask", ProjectRules: true, MemoryEnabled: true}
	for _, scope := range []struct{ kind, id, key string }{{"assistant", assistant, "runtime.settings"}, {"session", session, "runtime.settings"}} {
		if scope.id == "" {
			continue
		}
		var raw string
		err := tx.QueryRow("SELECT value_json FROM preferences WHERE assistant_id=? AND scope_type=? AND scope_id=? AND preference_key=?", assistant, scope.kind, scope.id, scope.key).Scan(&raw)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return value, err
		}
		if scope.kind == "session" {
			var local struct {
				Permission string `json:"permission"`
				FastMode   *bool  `json:"fastMode"`
			}
			if err = json.Unmarshal([]byte(raw), &local); err != nil {
				return value, err
			}
			if local.Permission != "" {
				value.Permission = local.Permission
			}
			if local.FastMode != nil {
				value.FastMode = *local.FastMode
			}
			continue
		}
		if err = json.Unmarshal([]byte(raw), &value); err != nil {
			return value, err
		}
	}
	return value, nil
}
func (c *Chat) RuntimeSettings(session string) (RuntimeSettings, error) {
	if session != "" {
		c.mu.Lock()
		_, err := c.find(session)
		c.mu.Unlock()
		if err != nil {
			return RuntimeSettings{}, err
		}
	}
	db, err := c.store.DB()
	if err != nil {
		return RuntimeSettings{}, err
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return RuntimeSettings{}, err
	}
	return settingsIn(db, assistant, session)
}
func (c *Chat) SetRuntimeSettings(session, raw string) error {
	var value RuntimeSettings
	if len(raw) > 2048 {
		return errors.New("设置内容过长")
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return errors.New("无效的设置内容")
	}
	if value.Permission != "ask" && value.Permission != "auto" && value.Permission != "full" {
		return errors.New("权限策略无效")
	}
	if session != "" {
		c.mu.Lock()
		_, err := c.find(session)
		c.mu.Unlock()
		if err != nil {
			return err
		}
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return err
	}
	data, _ := json.Marshal(value)
	scope, id := "assistant", assistant
	if session != "" {
		scope, id = "session", session
		data, _ = json.Marshal(map[string]any{"permission": value.Permission, "fastMode": value.FastMode})
	}
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,?,?,'runtime.settings',1,?,?) ON CONFLICT(assistant_id,scope_type,scope_id,preference_key) DO UPDATE SET revision=preferences.revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at`, assistant, scope, id, string(data), storage.Now())
		if err != nil {
			return err
		}
		_, err = storage.AppendEvent(tx, assistant, "settings.runtime_changed", "settings", id, 1, scope, id, "", map[string]any{"permission": value.Permission, "fast_mode": value.FastMode})
		return err
	})
}

type RuleFile struct {
	Path string `json:"path"`
	Text string `json:"text"`
	Hash string `json:"hash"`
}

func readRuleFile(root, name string) (RuleFile, error) {
	result := RuleFile{Path: filepath.Join(root, name), Hash: storage.Hash(nil)}
	directory, err := os.OpenRoot(root)
	if err != nil {
		return result, err
	}
	defer directory.Close()
	file, err := directory.Open(name)
	if os.IsNotExist(err) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return result, err
	}
	if !info.Mode().IsRegular() {
		return result, errors.New("规则路径必须为普通文件")
	}
	data, err := io.ReadAll(io.LimitReader(file, 64*1024+1))
	if err != nil {
		return result, err
	}
	if len(data) > 64*1024 || !utf8.Valid(data) || strings.ContainsRune(string(data), 0) {
		return result, errors.New("规则文件必须为 64 KiB 以内的 UTF-8 文本")
	}
	result.Text = string(data)
	result.Hash = storage.Hash(data)
	return result, nil
}
func (c *Chat) GlobalRules() (RuleFile, error) {
	if _, err := c.store.DB(); err != nil {
		return RuleFile{}, err
	}
	return readRuleFile(c.profile, "AGENTS.md")
}
func (c *Chat) SaveGlobalRules(text, hash string) (RuleFile, error) {
	if len(text) > 64*1024 || !utf8.ValidString(text) || strings.ContainsRune(text, 0) {
		return RuleFile{}, errors.New("规则文件必须为 64 KiB 以内的 UTF-8 文本")
	}
	c.fileMu.Lock()
	defer c.fileMu.Unlock()
	current, err := c.GlobalRules()
	if err != nil {
		return RuleFile{}, err
	}
	if current.Hash != hash {
		return RuleFile{}, errors.New("规则已被其他编辑器修改，请重新读取后再保存")
	}
	file, err := os.CreateTemp(c.profile, ".rules-*.tmp")
	if err != nil {
		return RuleFile{}, err
	}
	defer os.Remove(file.Name())
	if _, err = file.WriteString(text); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return RuleFile{}, err
	}
	if closeErr != nil {
		return RuleFile{}, closeErr
	}
	if err = os.Rename(file.Name(), current.Path); err != nil {
		return RuleFile{}, err
	}
	return c.GlobalRules()
}
func (c *Chat) OpenGlobalRules() error {
	rules, err := c.GlobalRules()
	if err != nil {
		return err
	}
	if _, err = os.Stat(rules.Path); os.IsNotExist(err) {
		file, e := os.OpenFile(rules.Path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			return e
		}
		if e = file.Close(); e != nil {
			return e
		}
	}
	return desktop.OpenPath(rules.Path)
}

type RunSettings struct {
	Policy RuntimeSettings `json:"policy"`
	Rules  []RuleFile      `json:"rules"`
}

func (c *Chat) freezeRunSettings(tx *sql.Tx, run Run) (RunSettings, error) {
	var raw sql.NullString
	var value RunSettings
	if err := tx.QueryRow("SELECT context_settings_json FROM run_parameters WHERE run_id=?", run.ID).Scan(&raw); err != nil {
		return value, err
	}
	if raw.Valid {
		err := json.Unmarshal([]byte(raw.String), &value)
		return value, err
	}
	settings, err := settingsIn(tx, run.AssistantID, run.SessionID)
	if err != nil {
		return value, err
	}
	value.Policy = settings
	value.Rules = []RuleFile{}
	global, err := readRuleFile(c.profile, "AGENTS.md")
	if err != nil {
		return value, err
	}
	if strings.TrimSpace(global.Text) != "" {
		value.Rules = append(value.Rules, global)
	}
	if settings.ProjectRules && run.Workspace != "" {
		for _, name := range []string{"AGENTS.md", "CHELA.md"} {
			rule, err := readRuleFile(run.Workspace, name)
			if err != nil {
				return value, err
			}
			if strings.TrimSpace(rule.Text) != "" {
				value.Rules = append(value.Rules, rule)
			}
		}
	}
	data, _ := json.Marshal(value)
	_, err = tx.Exec("UPDATE run_parameters SET context_settings_json=? WHERE run_id=?", string(data), run.ID)
	return value, err
}
