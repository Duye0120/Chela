package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type MCPConfig struct {
	ID          string            `json:"id"`
	Revision    int64             `json:"revision"`
	Project     string            `json:"project"`
	Description string            `json:"description"`
	URL         string            `json:"url,omitempty"`
	Command     string            `json:"command,omitempty"`
	Args        []string          `json:"args,omitempty"`
	Cwd         string            `json:"cwd,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	AutoApprove bool              `json:"autoApprove"`
}
type MCPStatus struct {
	Config      MCPConfig `json:"config"`
	Enabled     bool      `json:"enabled"`
	Health      string    `json:"health"`
	Problem     string    `json:"problem"`
	Tools       int       `json:"tools"`
	Credentials bool      `json:"credentials"`
}
type MCPTool struct {
	Name        string          `json:"name"`
	Remote      string          `json:"remote"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
	Version     string          `json:"version"`
	Server      string          `json:"server"`
}

var mcpID = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

func (c *Chat) readMCP(id string) (MCPConfig, int64, bool, error) {
	var cfg MCPConfig
	db, err := c.store.DB()
	if err != nil {
		return cfg, 0, false, err
	}
	var data []byte
	var revision int64
	var enabled bool
	if err = db.QueryRow("SELECT config_blob,revision,enabled FROM mcp_connections WHERE connection_id=?", id).Scan(&data, &revision, &enabled); err != nil {
		return cfg, 0, false, err
	}
	plain, err := unseal(data)
	if err != nil {
		return cfg, 0, false, err
	}
	err = json.Unmarshal(plain, &cfg)
	cfg.Revision = revision
	return cfg, revision, enabled, err
}
func (c *Chat) MCPServers() ([]MCPStatus, error) {
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query("SELECT config_blob,revision,enabled,health,last_error,json_array_length(catalog_json,'$.tools') FROM mcp_connections ORDER BY connection_id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []MCPStatus{}
	for rows.Next() {
		var status MCPStatus
		var data []byte
		var revision int64
		if err = rows.Scan(&data, &revision, &status.Enabled, &status.Health, &status.Problem, &status.Tools); err != nil {
			return nil, err
		}
		plain, err := unseal(data)
		if err != nil {
			return nil, err
		}
		if err = json.Unmarshal(plain, &status.Config); err != nil {
			return nil, err
		}
		status.Config.Revision = revision
		status.Credentials = len(status.Config.Env)+len(status.Config.Headers) > 0
		status.Config.Env = nil
		status.Config.Headers = nil
		result = append(result, status)
	}
	return result, rows.Err()
}
func (c *Chat) SaveMCP(raw string) error {
	var cfg MCPConfig
	if len(raw) > 65536 || json.Unmarshal([]byte(raw), &cfg) != nil || !mcpID.MatchString(cfg.ID) {
		return errors.New("连接 ID 需为小写字母开头，最多 32 位字母、数字或下划线")
	}
	if (cfg.URL == "") == (cfg.Command == "") {
		return errors.New("请选择 HTTP 地址或本机命令其中一种")
	}
	if len(cfg.Args) > 80 {
		return errors.New("命令参数过多")
	}
	if cfg.URL != "" {
		u, err := url.Parse(cfg.URL)
		if err != nil || u.Host == "" || u.User != nil || u.Fragment != "" || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1"))) {
			return errors.New("MCP 地址需为 HTTPS，本机环回地址可使用 HTTP")
		}
	}
	for _, path := range []*string{&cfg.Project, &cfg.Cwd} {
		if *path != "" {
			absolute, err := filepath.Abs(*path)
			if err != nil {
				return err
			}
			info, err := os.Stat(absolute)
			if err != nil || !info.IsDir() {
				return errors.New("项目或工作目录不存在")
			}
			*path = absolute
		}
	}
	if cfg.Command != "" && cfg.Cwd == "" {
		cfg.Cwd = cfg.Project
		if cfg.Cwd == "" {
			cfg.Cwd = c.profile
		}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.sending) > 0 {
		return errors.New("请在会话运行结束后修改 MCP 连接")
	}
	old, revision, _, err := c.readMCP(cfg.ID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil {
		if cfg.Revision != revision {
			return errors.New("MCP 配置已变化，请重新打开")
		}
		if cfg.Env == nil {
			cfg.Env = old.Env
		}
		if cfg.Headers == nil {
			cfg.Headers = old.Headers
		}
	} else if cfg.Revision != 0 {
		return errors.New("MCP 连接不存在")
	}
	if cfg.URL != "" {
		cfg.Env = nil
	} else {
		cfg.Headers = nil
	}
	plain, _ := json.Marshal(cfg)
	sealed, err := seal(plain)
	if err != nil {
		return err
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO mcp_connections(connection_id,revision,project_path,config_blob,config_hash,updated_at) VALUES(?,1,?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET revision=revision+1,project_path=excluded.project_path,config_blob=excluded.config_blob,config_hash=excluded.config_hash,enabled=0,health='disabled',last_error='',catalog_json='{"tools":[]}',updated_at=excluded.updated_at`, cfg.ID, cfg.Project, sealed, storage.Hash(plain), storage.Now())
		return err
	})
	if err != nil {
		return err
	}
	c.dropMCP(cfg.ID)
	return nil
}
func (c *Chat) dropMCP(id string) {
	c.mcpMu.Lock()
	slot := c.mcpClients[id]
	delete(c.mcpClients, id)
	c.mcpMu.Unlock()
	if slot != nil && slot.process != nil {
		slot.process.stop()
	}
}
func (c *Chat) ChangeMCP(id, action string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.sending) > 0 {
		return errors.New("请在运行结束后启停或重连 MCP")
	}
	_, _, _, err := c.readMCP(id)
	if err != nil {
		return err
	}
	c.dropMCP(id)
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		switch action {
		case "enable", "reconnect":
			_, err := tx.Exec("UPDATE mcp_connections SET enabled=1,health='connecting',last_error='',updated_at=? WHERE connection_id=?", storage.Now(), id)
			return err
		case "disable":
			_, err := tx.Exec("UPDATE mcp_connections SET enabled=0,health='disabled',updated_at=? WHERE connection_id=?", storage.Now(), id)
			return err
		case "remove":
			_, err := tx.Exec("DELETE FROM mcp_connections WHERE connection_id=?", id)
			return err
		default:
			return errors.New("不支持的 MCP 操作")
		}
	})
	if err != nil {
		return err
	}
	if action == "enable" || action == "reconnect" {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_, _, _, err = c.mcpConnection(ctx, id)
	}
	return err
}
func redactMCPError(message string, cfg MCPConfig) string {
	for _, values := range []map[string]string{cfg.Env, cfg.Headers} {
		for _, secret := range values {
			if secret != "" {
				message = strings.ReplaceAll(message, secret, "[redacted]")
			}
		}
	}
	if len(message) > 2000 {
		message = message[:2000]
	}
	return message
}
func (c *Chat) mcpHealth(id, health, problem string) {
	_ = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec("UPDATE mcp_connections SET health=?,last_error=?,updated_at=? WHERE connection_id=?", health, problem, storage.Now(), id)
		return err
	})
}
func (c *Chat) saveMCPCatalog(id string, revision int64, raw json.RawMessage) error {
	var catalog struct{ Tools []MCPTool }
	if len(raw) > 512*1024 || json.Unmarshal(raw, &catalog) != nil {
		return errors.New("MCP 工具目录超限或无效")
	}
	names := map[string]bool{}
	for _, tool := range catalog.Tools {
		if !strings.HasPrefix(tool.Name, "mcp__"+id+"__") || names[tool.Name] || tool.Version == "" || !json.Valid(tool.Parameters) {
			return errors.New("MCP 工具声明重复或无效")
		}
		names[tool.Name] = true
	}
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		result, err := tx.Exec("UPDATE mcp_connections SET catalog_json=?,health='connected',last_error='',updated_at=? WHERE connection_id=? AND revision=?", string(raw), storage.Now(), id, revision)
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err == nil && n != 1 {
			err = errors.New("MCP 配置版本过期")
		}
		return err
	})
}
func (c *Chat) freezeMCP(ctx context.Context, run Run) ([]MCPTool, error) {
	result := []MCPTool{}
	if run.Lane == "background" {
		return result, nil
	}
	servers, err := c.MCPServers()
	if err != nil {
		return nil, err
	}
	for _, server := range servers {
		cfg := server.Config
		if !server.Enabled || (cfg.Project != "" && !strings.EqualFold(cfg.Project, run.Workspace)) {
			continue
		}
		connectCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		_, _, revision, err := c.mcpConnection(connectCtx, cfg.ID)
		cancel()
		if err != nil {
			continue
		}
		db, err := c.store.DB()
		if err != nil {
			return nil, err
		}
		var raw string
		if err = db.QueryRow("SELECT catalog_json FROM mcp_connections WHERE connection_id=?", cfg.ID).Scan(&raw); err != nil {
			return nil, err
		}
		var catalog struct{ Tools []MCPTool }
		if err = json.Unmarshal([]byte(raw), &catalog); err != nil {
			return nil, err
		}
		err = c.store.Update(ctx, func(tx *sql.Tx) error {
			if err := validateLease(tx, run); err != nil {
				return err
			}
			for i := range catalog.Tools {
				tool := &catalog.Tools[i]
				tool.Server = cfg.ID
				raw, _ := json.Marshal(tool)
				if _, err := tx.Exec("INSERT INTO run_mcp_tools VALUES(?,?,?,?,?,?)", run.AttemptID, tool.Name, cfg.ID, revision, tool.Version, string(raw)); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
		result = append(result, catalog.Tools...)
	}
	if len(result) > 500 {
		return nil, fmt.Errorf("本轮 MCP 工具共 %d 项，超过 500 项上限", len(result))
	}
	return result, nil
}
