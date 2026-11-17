package chat

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/desktop"
	"github.com/Duye0120/Chela/native/internal/storage"
)

const appVersion = "0.1.0"
const releasePage = "https://github.com/Duye0120/Chela/releases"

type AppInformation struct {
	Version       string `json:"version"`
	Revision      string `json:"revision"`
	Platform      string `json:"platform"`
	Arch          string `json:"arch"`
	Go            string `json:"go"`
	DataDirectory string `json:"dataDirectory"`
	LogsDirectory string `json:"logsDirectory"`
}

func (c *Chat) AppInformation() AppInformation {
	info := AppInformation{Version: appVersion, Platform: runtime.GOOS, Arch: runtime.GOARCH, Go: runtime.Version(), DataDirectory: c.profile, LogsDirectory: filepath.Join(c.profile, "logs")}
	if build, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range build.Settings {
			if setting.Key == "vcs.revision" {
				info.Revision = setting.Value
			}
		}
	}
	return info
}
func (c *Chat) Diagnostics() (map[string]any, error) {
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	report := map[string]any{"format": 1, "generatedAt": storage.Now(), "version": appVersion, "platform": runtime.GOOS, "arch": runtime.GOARCH, "go": runtime.Version()}
	var integrity string
	if err = db.QueryRow("PRAGMA quick_check(1)").Scan(&integrity); err != nil {
		return nil, err
	}
	report["databaseHealthy"] = integrity == "ok"
	counts := map[string]int{}
	for name, query := range map[string]string{"schema": "SELECT COALESCE(max(version),0) FROM schema_migrations", "sessions": "SELECT count(*) FROM sessions WHERE deleted_at IS NULL", "runs": "SELECT count(*) FROM runs", "tasks": "SELECT count(*) FROM planner_items WHERE kind='task' AND deleted_at IS NULL", "notes": "SELECT count(*) FROM planner_items WHERE kind='note' AND deleted_at IS NULL", "pendingApprovals": "SELECT count(*) FROM approvals WHERE status='pending'", "mcpConnections": "SELECT count(*) FROM mcp_connections", "capabilities": "SELECT count(*) FROM capability_installations"} {
		var value int
		if err = db.QueryRow(query).Scan(&value); err != nil {
			return nil, err
		}
		counts[name] = value
	}
	report["counts"] = counts
	c.mu.Lock()
	report["runtimeStarted"] = c.started && !c.closed
	report["runtimeDegraded"] = c.runtimeError != ""
	c.mu.Unlock()
	if info, err := os.Stat(filepath.Join(c.profile, "logs", "host.log")); err == nil {
		report["log"] = map[string]any{"bytes": info.Size(), "modifiedAt": info.ModTime().UTC().Format(time.RFC3339)}
	}
	return report, nil
}
func (c *Chat) OpenDataLocation(kind string) error {
	path := c.profile
	if kind == "logs" {
		path = filepath.Join(path, "logs")
	} else if kind != "data" {
		return errors.New("未知的数据目录")
	}
	if err := os.MkdirAll(path, 0700); err != nil {
		return err
	}
	return desktop.OpenPath(path)
}

type UpdateInformation struct {
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	Status    string `json:"status"`
	URL       string `json:"url"`
	CheckedAt string `json:"checkedAt"`
}

func (c *Chat) CheckUpdates() (UpdateInformation, error) {
	result := UpdateInformation{Current: appVersion, URL: releasePage, CheckedAt: storage.Now()}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/repos/Duye0120/Chela/releases/latest", nil)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "Chela")
	response, err := c.network.Client().Do(request)
	if err != nil {
		return result, errors.New("更新检查失败，请检查网络或代理")
	}
	defer response.Body.Close()
	if response.StatusCode == 404 {
		result.Status = "no_release"
		return result, nil
	}
	if response.StatusCode != 200 {
		return result, errors.New("发行服务暂不可用，请稍后重试")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 1024*1024+1))
	if err != nil || len(data) > 1024*1024 {
		return result, errors.New("发行信息读取失败")
	}
	var release struct {
		Tag        string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
	}
	if err = json.Unmarshal(data, &release); err != nil || release.Tag == "" || len(release.Tag) > 100 {
		return result, errors.New("发行版本信息无效")
	}
	result.Latest = release.Tag
	result.Status = "available"
	if strings.TrimPrefix(release.Tag, "v") == appVersion {
		result.Status = "current"
	}
	return result, nil
}
func (c *Chat) OpenReleaseNotes() error { return desktop.OpenExternal(releasePage) }
