package maintenance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type File struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}
type Manifest struct {
	Format        int              `json:"format"`
	Created       string           `json:"created"`
	Source        string           `json:"source"`
	SQLiteVersion string           `json:"sqliteVersion"`
	SQLiteSource  string           `json:"sqliteSource"`
	Schema        int              `json:"schema"`
	PiFormat      int              `json:"piFormat"`
	Files         []File           `json:"files"`
	Counts        map[string]int64 `json:"counts,omitempty"`
}

func readDB(path string) (*sql.DB, error) {
	uriPath := filepath.ToSlash(path)
	if filepath.VolumeName(path) != "" && !strings.HasPrefix(uriPath, "/") {
		uriPath = "/" + uriPath
	}
	u := url.URL{Scheme: "file", Path: uriPath, RawQuery: "mode=ro&_pragma=busy_timeout(5000)"}
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err = db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func snapshotDB(source, target string) error {
	db, err := readDB(source)
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err = db.Exec("VACUUM INTO ?", target); err != nil {
		return err
	}
	check, err := readDB(target)
	if err != nil {
		return err
	}
	defer check.Close()
	var integrity string
	if err = check.QueryRow("PRAGMA integrity_check").Scan(&integrity); err != nil {
		return err
	}
	if integrity != "ok" {
		return errors.New("备份数据库完整性检查失败")
	}
	return nil
}

// Only application data is copied; Chromium caches and unrelated profile files are excluded.
func dataPaths(profile string) ([]string, error) {
	paths := []string{}
	entries, err := os.ReadDir(profile)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() {
			if name != "data" && name != "chat-sessions" && name != "capabilities" && name != "blobs" {
				continue
			}
		} else if !strings.HasSuffix(name, ".json") && !strings.HasSuffix(name, ".db") {
			continue
		}
		if name == "backup-manifest.json" || name == "restore-report.json" {
			continue
		}
		err = filepath.WalkDir(filepath.Join(profile, name), func(path string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if d.Type()&os.ModeSymlink != 0 {
				return fmt.Errorf("备份不跟随符号链接: %s", path)
			}
			if d.IsDir() {
				return nil
			}
			if !d.Type().IsRegular() {
				return fmt.Errorf("不支持的资料文件: %s", path)
			}
			if strings.HasSuffix(path, "-wal") || strings.HasSuffix(path, "-shm") {
				return nil
			}
			rel, err := filepath.Rel(profile, path)
			if err != nil {
				return err
			}
			paths = append(paths, rel)
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	return paths, nil
}

func newDestination(source, destination string) (string, string, error) {
	source, err := filepath.Abs(source)
	if err != nil {
		return "", "", err
	}
	destination, err = filepath.Abs(destination)
	if err != nil {
		return "", "", err
	}
	rel, err := filepath.Rel(source, destination)
	if err == nil && (rel == "." || filepath.IsLocal(rel)) {
		return "", "", errors.New("输出目录必须在源目录之外")
	}
	if _, err = os.Lstat(destination); !errors.Is(err, os.ErrNotExist) {
		return "", "", errors.New("输出目录必须尚不存在；不会覆盖原数据")
	}
	if err = os.MkdirAll(filepath.Dir(destination), 0700); err != nil {
		return "", "", err
	}
	stage, err := os.MkdirTemp(filepath.Dir(destination), ".chela-maintenance-")
	return destination, stage, err
}

func copyFile(source, target string) (File, error) {
	data, err := os.ReadFile(source)
	if err != nil {
		return File{}, err
	}
	if err = os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return File{}, err
	}
	f, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return File{}, err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	return File{Size: int64(len(data)), SHA256: storage.Hash(data)}, err
}

func databaseFacts(profile string, m *Manifest) error {
	path := filepath.Join(profile, "chela.db")
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	db, err := readDB(path)
	if err != nil {
		return err
	}
	defer db.Close()
	if err = db.QueryRow("SELECT sqlite_version(),sqlite_source_id()").Scan(&m.SQLiteVersion, &m.SQLiteSource); err != nil {
		return err
	}
	if err = db.QueryRow("SELECT max(version) FROM schema_migrations").Scan(&m.Schema); err != nil {
		return err
	}
	var unsupported int
	if err = db.QueryRow("SELECT count(*) FROM pi_sessions WHERE json_extract(header_json,'$.version')<>3 OR json_extract(header_json,'$.version') IS NULL").Scan(&unsupported); err != nil {
		return err
	}
	if unsupported > 0 {
		return errors.New("备份包含不支持的 Pi entry format")
	}
	m.Counts = map[string]int64{}
	for _, table := range []string{"sessions", "messages", "pi_entries", "memories", "planner_items", "terminal_sessions", "tool_invocations", "erasure_rules", "legacy_import_map"} {
		var n int64
		if err = db.QueryRow("SELECT count(*) FROM " + table).Scan(&n); err != nil {
			return err
		}
		m.Counts[table] = n
	}
	return nil
}

// VACUUM INTO produces a committed SQLite snapshot including WAL data.
func Backup(source, destination string) (Manifest, error) {
	m := Manifest{Format: 1, Created: storage.Now(), PiFormat: 3, Files: []File{}}
	source, err := filepath.Abs(source)
	if err != nil {
		return m, err
	}
	m.Source = source
	paths, err := dataPaths(source)
	if err != nil {
		return m, err
	}
	destination, stage, err := newDestination(source, destination)
	if err != nil {
		return m, err
	}
	defer os.RemoveAll(stage)
	for _, rel := range paths {
		from, to := filepath.Join(source, rel), filepath.Join(stage, rel)
		var f File
		if strings.HasSuffix(rel, ".db") {
			if err = os.MkdirAll(filepath.Dir(to), 0700); err == nil {
				err = snapshotDB(from, to)
			}
			if err == nil {
				var data []byte
				data, err = os.ReadFile(to)
				f = File{Size: int64(len(data)), SHA256: storage.Hash(data)}
			}
		} else {
			f, err = copyFile(from, to)
			if err == nil {
				var current []byte
				current, err = os.ReadFile(from)
				if err == nil && storage.Hash(current) != f.SHA256 {
					err = errors.New("资料正在修改，请在保存结束后重试备份")
				}
			}
		}
		if err != nil {
			return m, err
		}
		f.Path = filepath.ToSlash(rel)
		m.Files = append(m.Files, f)
	}
	if err = databaseFacts(stage, &m); err != nil {
		return m, err
	}
	raw, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return m, err
	}
	if err = os.WriteFile(filepath.Join(stage, "backup-manifest.json"), raw, 0600); err != nil {
		return m, err
	}
	if _, err = Verify(stage); err != nil {
		return m, err
	}
	return m, os.Rename(stage, destination)
}

func Verify(directory string) (Manifest, error) {
	var m Manifest
	raw, err := os.ReadFile(filepath.Join(directory, "backup-manifest.json"))
	if err != nil {
		return m, err
	}
	if err = json.Unmarshal(raw, &m); err != nil {
		return m, err
	}
	if m.Format != 1 || m.PiFormat != 3 {
		return m, errors.New("不支持的备份或 Pi 历史格式")
	}
	seen := map[string]bool{}
	for _, f := range m.Files {
		if !filepath.IsLocal(filepath.FromSlash(f.Path)) || seen[f.Path] {
			return m, errors.New("备份清单路径无效或重复")
		}
		seen[f.Path] = true
		root, err := os.OpenRoot(directory)
		if err != nil {
			return m, err
		}
		data, err := root.ReadFile(filepath.FromSlash(f.Path))
		root.Close()
		if err != nil {
			return m, err
		}
		if int64(len(data)) != f.Size || storage.Hash(data) != f.SHA256 {
			return m, fmt.Errorf("备份校验失败: %s", f.Path)
		}
	}
	if m.Schema > 0 && !seen["chela.db"] {
		return m, errors.New("备份缺少主数据库")
	}
	if m.Schema > 0 {
		db, err := readDB(filepath.Join(directory, "chela.db"))
		if err != nil {
			return m, err
		}
		defer db.Close()
		rows, err := db.Query("SELECT relative_path,sha256,byte_length FROM blobs WHERE state='available'")
		if err != nil {
			return m, err
		}
		defer rows.Close()
		for rows.Next() {
			var path, hash string
			var size int64
			if err = rows.Scan(&path, &hash, &size); err != nil {
				return m, err
			}
			found := false
			for _, file := range m.Files {
				if file.Path == filepath.ToSlash(path) && file.SHA256 == hash && file.Size == size {
					found = true
					break
				}
			}
			if !found {
				return m, fmt.Errorf("附件缺失或校验失败: %s", path)
			}
		}
		if err = rows.Err(); err != nil {
			return m, err
		}
	}
	return m, nil
}

func copyManifest(source, target string, m Manifest) error {
	for _, f := range m.Files {
		copied, err := copyFile(filepath.Join(source, filepath.FromSlash(f.Path)), filepath.Join(target, filepath.FromSlash(f.Path)))
		if err != nil {
			return err
		}
		if copied.SHA256 != f.SHA256 || copied.Size != f.Size {
			return errors.New("备份在校验后发生变化")
		}
	}
	return nil
}

func disableRestoredWork(tx *sql.Tx) error {
	for _, q := range []string{
		"UPDATE runs SET state='interrupted',phase='idle',terminal_reason='从备份恢复；请核对原现场后手动继续',revision=revision+1 WHERE state NOT IN ('succeeded','failed','cancelled','interrupted')",
		"UPDATE run_attempts SET state='interrupted' WHERE state IN ('starting','running')",
		"UPDATE run_inputs SET state='cancelled' WHERE state='queued'",
		"UPDATE tool_invocations SET state='outcome_unknown' WHERE state='executing'",
		"UPDATE tool_invocations SET state='cancelled' WHERE state IN ('planned','awaiting_approval')",
		"UPDATE approvals SET status='invalidated',revision=revision+1 WHERE status IN ('pending','approved')",
		"UPDATE branches SET lease_run_id=NULL,lease_until=NULL,lease_token=lease_token+1",
		"UPDATE consolidation_jobs SET state='cancelled',lease_owner=NULL,lease_until=NULL,fencing_token=fencing_token+1 WHERE state IN ('queued','running')",
		"UPDATE terminal_sessions SET process_state='interrupted' WHERE process_state IN ('starting','running')",
		"UPDATE extension_ui_requests SET state='expired' WHERE state IN ('pending','notified')",
		"UPDATE capability_installations SET enabled=0,health='disabled'",
		"UPDATE mcp_connections SET enabled=0,health='disabled'",
		"UPDATE deliveries SET status='revoked',revision=revision+1 WHERE status IN ('pending','deferred','presented')",
		"UPDATE presentations SET state='ended' WHERE state='active'",
	} {
		if _, err := tx.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func closeStore(store *storage.Store, err error) error {
	closeErr := store.Close()
	if err != nil {
		return err
	}
	return closeErr
}

// A restored profile is never activated by this command.
func Restore(backup, current, destination string) (Manifest, error) {
	m, err := Verify(backup)
	if err != nil {
		return m, err
	}
	if current == "" {
		return m, errors.New("请提供当前资料目录，以合并最新删除和遗忘登记")
	}
	destination, stage, err := newDestination(backup, destination)
	if err != nil {
		return m, err
	}
	defer os.RemoveAll(stage)
	if err = copyManifest(backup, stage, m); err != nil {
		return m, err
	}
	store := storage.New(stage)
	if _, err = store.DB(); err != nil {
		return m, closeStore(store, err)
	}
	if err = applyCurrentDeletions(store, current); err != nil {
		return m, closeStore(store, err)
	}
	err = store.Update(context.Background(), func(tx *sql.Tx) error {
		if err := disableRestoredWork(tx); err != nil {
			return err
		}
		_, err := tx.Exec("UPDATE capability_installations SET manifest_json=json_set(manifest_json,'$.root',? || '/capabilities/' || capability_id || '/' || build_hash)", filepath.ToSlash(destination))
		return err
	})
	if err = closeStore(store, err); err != nil {
		return m, err
	}
	report, _ := json.Marshal(map[string]any{"restoredAt": storage.Now(), "backup": backup, "deletionsFrom": current, "automaticExecution": false})
	if err = os.WriteFile(filepath.Join(stage, "restore-report.json"), report, 0600); err != nil {
		return m, err
	}
	return m, os.Rename(stage, destination)
}
