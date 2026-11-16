package maintenance

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Duye0120/Chela/native/internal/chat"
	"github.com/Duye0120/Chela/native/internal/companion"
	"github.com/Duye0120/Chela/native/internal/memory"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
)

func TestBackupRestoreKeepsErasureAndStopsPendingWork(t *testing.T) {
	profile := t.TempDir()
	store := storage.New(profile)
	c, closeChat := chat.New(profile, store)
	defer closeChat()
	s, err := c.Create()
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(memory.Proposal{CommandID: "fixture-memory", SessionID: s.ID, ScopeType: "assistant", Subject: "user", Slot: "preference", Kind: "preference", Content: "这是备份测试偏好"})
	m, err := c.SaveMemory(string(raw))
	if err != nil {
		t.Fatal(err)
	}
	w := work.New(profile, store)
	task, err := w.SaveTask(work.WorkTask{Title: "备份测试任务", Status: "待办"})
	if err != nil {
		t.Fatal(err)
	}
	err = store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO runs(run_id,assistant_id,session_id,branch_id,origin,lane,state,phase,scope_json,budget_json,created_at,updated_at) VALUES('queued-fixture',?,?,?,'user','foreground','queued','idle','{}','{}',?,?)`, s.AssistantID, s.ID, s.BranchID, storage.Now(), storage.Now())
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(t.TempDir(), "backup")
	manifest, err := Backup(profile, backup)
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Counts["memories"] != 1 || manifest.SQLiteSource == "" {
		t.Fatal(manifest)
	}
	if err = c.ForgetMemory(s.ID, m.ID, "1"); err != nil {
		t.Fatal(err)
	}
	if err = w.DeleteTask(task.ID); err != nil {
		t.Fatal(err)
	}
	restored := filepath.Join(t.TempDir(), "restored")
	if _, err = Restore(backup, profile, restored); err != nil {
		t.Fatal(err)
	}
	r := storage.New(restored)
	defer r.Close()
	db, err := r.DB()
	if err != nil {
		t.Fatal(err)
	}
	var state string
	var content sql.NullString
	if err = db.QueryRow("SELECT status,content FROM memories JOIN memory_revisions USING(memory_id) WHERE memory_id=?", m.ID).Scan(&state, &content); err != nil || state != "erased" || content.Valid {
		t.Fatal("memory resurrected", state, content, err)
	}
	if err = db.QueryRow("SELECT state FROM runs WHERE run_id='queued-fixture'").Scan(&state); err != nil || state != "interrupted" {
		t.Fatal("queued work can restart", state, err)
	}
	var deleted sql.NullString
	if err = db.QueryRow("SELECT deleted_at FROM planner_items WHERE item_id=?", task.ID).Scan(&deleted); err != nil || !deleted.Valid {
		t.Fatal("deleted task resurrected", deleted, err)
	}
	if _, err = Restore(backup, profile, restored); err == nil {
		t.Fatal("existing profile overwritten")
	}
	if err = os.WriteFile(filepath.Join(backup, "chela.db"), []byte("corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = Verify(backup); err == nil {
		t.Fatal("corrupt backup accepted")
	}
	if _, err = Restore(backup, profile, filepath.Join(t.TempDir(), "refused")); err == nil {
		t.Fatal("corrupt restore accepted")
	}
}

func TestMigrationPreviewPreservesSourceAndIsIdempotent(t *testing.T) {
	profile := t.TempDir()
	legacy := `{"tasks":[{"id":"task","title":"原任务","status":"待办","date":"2026-11-15"}],"notes":[{"id":"note","title":"笔记","content":"原文"}]}`
	if err := os.WriteFile(filepath.Join(profile, "work.json"), []byte(legacy), 0600); err != nil {
		t.Fatal(err)
	}
	sessions := `[{"id":"session","title":"旧聊天","createdAt":"2026-11-15T00:00:00.000Z","updatedAt":"2026-11-15T00:00:00.000Z","messages":[{"id":"message","role":"user","content":"原消息","createdAt":"2026-11-15T00:00:00.000Z"}]}]`
	if err := os.WriteFile(filepath.Join(profile, "chat-sessions.json"), []byte(sessions), 0600); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(t.TempDir(), "preview")
	r, err := Preview(profile, out)
	if err != nil {
		t.Fatal(err)
	}
	if !r.RepeatedImportStable || r.Activated || r.After["sessions"] != 1 || r.After["planner_items"] != 2 {
		t.Fatal(r)
	}
	if _, err = os.Stat(filepath.Join(profile, "chela.db")); !os.IsNotExist(err) {
		t.Fatal("source changed", err)
	}
	if got, err := os.ReadFile(filepath.Join(profile, "work.json")); err != nil || string(got) != legacy {
		t.Fatal("legacy file changed", err)
	}
	if _, err = Verify(filepath.Join(out, "source")); err != nil {
		t.Fatal(err)
	}
}

func TestRestoreRejectsNewerDatabase(t *testing.T) {
	profile := t.TempDir()
	s := storage.New(profile)
	db, err := s.DB()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("INSERT INTO schema_migrations VALUES(999,'future','now','future')"); err != nil {
		t.Fatal(err)
	}
	s.Close()
	reopened := storage.New(profile)
	defer reopened.Close()
	if _, err = reopened.DB(); err == nil || !strings.Contains(err.Error(), "高于") {
		t.Fatal("new schema writable", err)
	}
}

func TestElectronPlannerAndModeMigration(t *testing.T) {
	profile := t.TempDir()
	planner := `{"version":1,"items":[{"id":"old-task","title":"未完成任务","kind":"todo","content":"说明","date":"2026-11-15","status":"review","completed":false,"remindAt":"2026-11-15T13:00:00.125Z","remindedAt":null,"createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-14T00:00:00Z","executions":[{"terminalId":"original-terminal","executor":"codex","directory":"C:/fixture","state":"exited","source":"terminal","result":"done","startedAt":"2026-11-14T00:00:00Z"}]}]}`
	if err := os.WriteFile(filepath.Join(profile, "planner.json"), []byte(planner), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(profile, "data"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profile, "data", "emotional-state.json"), []byte(`{"currentMode":"quiet","locked":true,"confidence":0.6,"signals":[{"value":1}]}`), 0600); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(t.TempDir(), "preview")
	r, err := Preview(profile, out)
	if err != nil {
		t.Fatal(err)
	}
	if r.After["planner_items"] != 1 || r.After["terminal_sessions"] != 1 || r.After["legacy_import_map"] != 3 || !r.RepeatedImportStable {
		t.Fatal(r)
	}
	store := storage.New(filepath.Join(out, "profile"))
	defer store.Close()
	tasks, err := work.New(filepath.Join(out, "profile"), store).Tasks()
	if err != nil || len(tasks) != 1 || tasks[0].Status != "待查看" {
		t.Fatal(tasks, err)
	}
	err = store.Update(context.Background(), func(tx *sql.Tx) error {
		var assistant string
		if err := tx.QueryRow("SELECT assistant_id FROM assistants").Scan(&assistant); err != nil {
			return err
		}
		settings, err := companion.LoadSettings(tx, assistant)
		if err != nil {
			return err
		}
		if settings.Mode != "quiet" || !settings.ModeLocked {
			t.Fatal("mode lock lost", settings)
		}
		var completed sql.NullString
		var state, next string
		if err = tx.QueryRow("SELECT completed_at FROM planner_items WHERE item_id='old-task'").Scan(&completed); err != nil {
			return err
		}
		if completed.Valid {
			t.Fatal("terminal text completed task")
		}
		if err = tx.QueryRow("SELECT process_state FROM terminal_sessions WHERE terminal_session_id='original-terminal'").Scan(&state); err != nil {
			return err
		}
		if state != "interrupted" {
			t.Fatal(state)
		}
		if err = tx.QueryRow("SELECT next_fire_at FROM reminder_rules WHERE item_id='old-task'").Scan(&next); err != nil {
			return err
		}
		if next != "2026-11-15T13:00:00.125Z" {
			t.Fatal("reminder instant changed", next)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSchemaUpgradeKeepsPreMigrationSnapshot(t *testing.T) {
	profile := t.TempDir()
	s := storage.New(profile)
	db, err := s.DB()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("DROP TABLE run_mcp_tools; DROP TABLE mcp_connections; DELETE FROM schema_migrations WHERE version=16"); err != nil {
		t.Fatal(err)
	}
	s.Close()
	next := storage.New(profile)
	defer next.Close()
	if _, err = next.DB(); err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob(filepath.Join(profile, "schema-backups", "*.db"))
	if err != nil || len(files) != 1 {
		t.Fatal(files, err)
	}
	old, err := readDB(files[0])
	if err != nil {
		t.Fatal(err)
	}
	defer old.Close()
	var version int
	if err = old.QueryRow("SELECT max(version) FROM schema_migrations").Scan(&version); err != nil || version != 15 {
		t.Fatal("backup was taken after migration", version, err)
	}
}
