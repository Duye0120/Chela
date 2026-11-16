package storage

import (
	"context"
	"database/sql"
	"errors"
	"testing"
)

func TestIdentityAndTransactionalEvents(t *testing.T) {
	profile := t.TempDir()
	store := New(profile)
	id, err := store.Identity()
	if err != nil {
		t.Fatal(err)
	}
	db, _ := store.DB()
	var version string
	if err := db.QueryRow("SELECT sqlite_version()").Scan(&version); err != nil {
		t.Fatal(err)
	}
	t.Log("SQLite", version)
	wantFailure := errors.New("abort domain write")
	err = store.Update(context.Background(), func(tx *sql.Tx) error {
		if _, err := AppendEvent(tx, id, "test.changed", "test", "record", 1, "assistant", id, "command", map[string]string{"value": "中文"}); err != nil {
			return err
		}
		return wantFailure
	})
	if !errors.Is(err, wantFailure) {
		t.Fatalf("rollback error: %v", err)
	}
	events, err := store.Events("0")
	if err != nil || len(events) != 0 {
		t.Fatalf("rolled-back event became visible: %v %v", events, err)
	}
	err = store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := AppendEvent(tx, id, "test.changed", "test", "record", 1, "assistant", id, "command", map[string]string{"value": "中文"})
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	events, err = store.Events("0")
	if err != nil || len(events) != 1 || events[0].Seq != "1" {
		t.Fatalf("commit: %v %v", events, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := New(profile)
	defer reopened.Close()
	got, err := reopened.Identity()
	if err != nil || got != id {
		t.Fatalf("identity changed: %s %v", got, err)
	}
	events, err = reopened.Events("1")
	if err != nil || len(events) != 0 {
		t.Fatalf("cursor replayed committed event: %v %v", events, err)
	}
}
