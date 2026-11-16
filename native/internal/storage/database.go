package storage

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct {
	profile     string
	mu          sync.Mutex
	db          *sql.DB
	assistantID string
	closed      bool
}

// New has no filesystem or service side effects, including during binding generation.
func New(profile string) *Store { return &Store{profile: profile} }

func Now() string             { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }
func Hash(data []byte) string { return fmt.Sprintf("%x", sha256.Sum256(data)) }

func (s *Store) DB() (*sql.DB, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, errors.New("Chela 数据库已关闭")
	}
	if s.db != nil {
		return s.db, nil
	}
	if err := os.MkdirAll(s.profile, 0700); err != nil {
		return nil, err
	}
	path := filepath.Join(s.profile, "chela.db")
	db, err := sql.Open("sqlite", filepath.ToSlash(path)+"?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=synchronous(FULL)&_txlock=immediate")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err = initialize(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	var assistantID string
	err = db.QueryRow("SELECT assistant_id FROM assistants").Scan(&assistantID)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	s.db, s.assistantID = db, assistantID
	return db, nil
}

func initialize(db *sql.DB) error {
	var hasMigrations, tableCount int
	if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'").Scan(&hasMigrations); err != nil {
		return err
	}
	if hasMigrations == 0 {
		if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table'").Scan(&tableCount); err != nil {
			return err
		}
		if tableCount != 0 {
			return errors.New("chela.db 含未知数据结构，已停止初始化")
		}
	}
	files, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	if hasMigrations != 0 {
		var newest int
		if err := db.QueryRow("SELECT COALESCE(max(version),0) FROM schema_migrations").Scan(&newest); err != nil {
			return err
		}
		if newest > len(files) {
			return fmt.Errorf("数据库版本 %d 高于此程序支持的 %d，请使用匹配版本或恢复备份", newest, len(files))
		}
		if newest < len(files) {
			var path string
			if err := db.QueryRow("SELECT file FROM pragma_database_list WHERE name='main'").Scan(&path); err != nil {
				return err
			}
			directory := filepath.Join(filepath.Dir(path), "schema-backups")
			if err := os.MkdirAll(directory, 0700); err != nil {
				return err
			}
			backup := filepath.Join(directory, fmt.Sprintf("before-v%d-to-v%d-%s.db", newest, len(files), rand.Text()))
			if _, err := db.Exec("VACUUM INTO ?", backup); err != nil {
				return fmt.Errorf("升级前备份失败，数据库保持原版本: %w", err)
			}
		}
	}
	if _, err := db.Exec("PRAGMA journal_mode = WAL"); err != nil {
		return err
	}
	for index, file := range files {
		data, err := migrations.ReadFile("migrations/" + file.Name())
		if err != nil {
			return err
		}
		version := index + 1
		checksum := Hash(data)
		if hasMigrations != 0 {
			var existing string
			err = db.QueryRow("SELECT checksum FROM schema_migrations WHERE version=?", version).Scan(&existing)
			if err == nil {
				if existing != checksum {
					return fmt.Errorf("数据库迁移 %d 校验不一致", version)
				}
				continue
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}
		}
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err = tx.Exec(string(data)); err == nil {
			_, err = tx.Exec("INSERT INTO schema_migrations VALUES(?,?,?,?)", version, checksum, Now(), "chela-v1")
		}
		if err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("数据库迁移 %d 失败: %w", version, err)
		}
		if err = tx.Commit(); err != nil {
			return err
		}
		hasMigrations = 1
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var count int
	if err := tx.QueryRow("SELECT count(*) FROM assistants").Scan(&count); err != nil {
		return err
	}
	if count > 1 {
		return errors.New("当前用户空间存在多个助手身份，请先核对数据")
	}
	if count == 0 {
		id, now := rand.Text(), Now()
		if _, err := tx.Exec("INSERT INTO assistants(assistant_id,display_name,created_at) VALUES(?,?,?)", id, "Chela", now); err != nil {
			return err
		}
		if _, err := tx.Exec("INSERT INTO persona_versions(assistant_id,revision,profile_json,created_at) VALUES(?,1,?,?)", id, `{"name":"Chela","system_prompt":"你是 Chela，用户持续相处的个人助手。根据对话内容回答，默认使用用户的语言。"}`, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) Identity() (string, error) {
	if _, err := s.DB(); err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.assistantID, nil
}

func (s *Store) Update(ctx context.Context, change func(*sql.Tx) error) error {
	db, err := s.DB()
	if err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := change(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

type Event struct {
	EventID           string          `json:"event_id"`
	Seq               string          `json:"seq"`
	EventType         string          `json:"event_type"`
	AggregateType     string          `json:"aggregate_type"`
	AggregateID       string          `json:"aggregate_id"`
	AggregateRevision int64           `json:"aggregate_revision"`
	AssistantID       string          `json:"assistant_id"`
	ScopeType         string          `json:"scope_type"`
	ScopeID           string          `json:"scope_id"`
	CorrelationID     string          `json:"correlation_id"`
	CommittedAt       string          `json:"committed_at"`
	Payload           json.RawMessage `json:"payload"`
}

// AppendEvent is called in the same transaction as the domain mutation.
func AppendEvent(tx *sql.Tx, assistant, eventType, aggregate, id string, revision int64, scopeType, scopeID, correlation string, payload any) (string, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	eventID, now := rand.Text(), Now()
	result, err := tx.Exec(`INSERT INTO domain_events(event_id,assistant_id,event_type,aggregate_type,aggregate_id,aggregate_revision,occurred_at,committed_at,correlation_id,scope_type,scope_id,payload_version,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?)`, eventID, assistant, eventType, aggregate, id, revision, now, now, correlation, scopeType, scopeID, string(data))
	if err != nil {
		return "", err
	}
	seq, err := result.LastInsertId()
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(`INSERT INTO outbox(outbox_id,event_id,kind,consumer_id,dedupe_key,payload_json,state,next_attempt_at,created_at) VALUES(?,?,'domain_event','supervisor',?,?,'pending',?,?)`, rand.Text(), eventID, "supervisor:"+eventID, string(data), now, now); err != nil {
		return "", err
	}
	return strconv.FormatInt(seq, 10), nil
}

func (s *Store) Events(after string) ([]Event, error) {
	if after == "" {
		after = "0"
	}
	cursor, err := strconv.ParseInt(after, 10, 64)
	if err != nil || cursor < 0 {
		return nil, errors.New("无效的事件游标")
	}
	db, err := s.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT event_id,cast(seq AS TEXT),event_type,aggregate_type,aggregate_id,aggregate_revision,assistant_id,scope_type,scope_id,correlation_id,committed_at,payload_json FROM domain_events WHERE seq>? ORDER BY seq LIMIT 256`, cursor)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []Event{}
	for rows.Next() {
		var e Event
		var payload string
		if err := rows.Scan(&e.EventID, &e.Seq, &e.EventType, &e.AggregateType, &e.AggregateID, &e.AggregateRevision, &e.AssistantID, &e.ScopeType, &e.ScopeID, &e.CorrelationID, &e.CommittedAt, &payload); err != nil {
			return nil, err
		}
		e.Payload = json.RawMessage(payload)
		events = append(events, e)
	}
	return events, rows.Err()
}
