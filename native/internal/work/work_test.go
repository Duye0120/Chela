package work

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func TestLegacyImportAndPlannerEdits(t *testing.T) {
	profile := t.TempDir()
	legacy := workData{Tasks: []WorkTask{{ID: "old", Title: "原任务", Status: "待办", Date: "2026-03-08", EndDate: "2026-03-09", Timezone: "America/New_York"}}, Notes: []WorkNote{{ID: "note", Title: "笔记", Content: "原文", UpdatedAt: "2026-01-01T00:00:00.000Z"}}}
	raw, _ := json.Marshal(legacy)
	if err := os.WriteFile(filepath.Join(profile, "work.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	store := storage.New(profile)
	defer store.Close()
	w := New(profile, store)
	tasks, err := w.Tasks()
	if err != nil || len(tasks) != 1 {
		t.Fatalf("import: %+v %v", tasks, err)
	}
	if tasks[0].DueDate != "" || tasks[0].EndDate != "2026-03-09" {
		t.Fatal("legacy dates reinterpreted")
	}
	task := tasks[0]
	task.DueDate = "2026-03-15"
	saved, err := w.SaveTask(task)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = w.SaveTask(task); err == nil {
		t.Fatal("stale revision accepted")
	}
	saved.Date = "2026-03-10"
	saved.EndDate = "2026-03-11"
	saved, err = w.SaveTask(saved)
	if err != nil || saved.DueDate != "2026-03-15" {
		t.Fatalf("moving deadline: %+v %v", saved, err)
	}
	db, _ := store.DB()
	var count int
	if err = db.QueryRow("SELECT count(*) FROM legacy_import_map WHERE source_system='work-json-v1'").Scan(&count); err != nil || count != 2 {
		t.Fatalf("maps %d %v", count, err)
	}
	notes, err := w.Notes()
	if err != nil || len(notes) != 1 {
		t.Fatalf("notes %v %v", notes, err)
	}
	note := notes[0]
	note.Content = "修订"
	if _, err = w.SaveNote(note); err != nil {
		t.Fatal(err)
	}
	if _, err = w.SaveNote(note); err == nil {
		t.Fatal("stale note accepted")
	}
	child, err := w.SaveTask(WorkTask{Title: "子任务", ParentID: saved.ID})
	if err != nil {
		t.Fatal(err)
	}
	if err = w.DeleteTask(saved.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = w.SaveTask(saved); err == nil {
		t.Fatal("deleted item resurrected")
	}
	tasks, err = w.Tasks()
	if err != nil || len(tasks) != 1 || tasks[0].ID != child.ID || tasks[0].ParentID != "" {
		t.Fatalf("delete: %v %v", tasks, err)
	}
	preserved, _ := os.ReadFile(filepath.Join(profile, "work.json"))
	if string(preserved) != string(raw) {
		t.Fatal("legacy source changed")
	}
	if err = store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := storage.New(profile)
	defer reopened.Close()
	again, err := New(profile, reopened).Tasks()
	if err != nil || len(again) != 1 || again[0].ID != child.ID {
		t.Fatalf("import repeated: %v %v", again, err)
	}
}

func TestPlannerDSTAndDeadline(t *testing.T) {
	store := storage.New(t.TempDir())
	defer store.Close()
	w := New(t.TempDir(), store)
	task, err := w.SaveTask(WorkTask{Title: "夏令时", Date: "2026-03-08", Timezone: "America/New_York", DueLocal: "2026-03-08T09:00"})
	if err != nil {
		t.Fatal(err)
	}
	if task.DueAt != "2026-03-08T13:00:00.000Z" {
		t.Fatal(task.DueAt)
	}
	db, _ := store.DB()
	var start, end string
	if err = db.QueryRow("SELECT start_at,end_at FROM schedule_blocks WHERE item_id=?", task.ID).Scan(&start, &end); err != nil {
		t.Fatal(err)
	}
	a, _ := time.Parse(time.RFC3339, start)
	b, _ := time.Parse(time.RFC3339, end)
	if b.Sub(a) != 23*time.Hour {
		t.Fatalf("DST day duration %v", b.Sub(a))
	}
	for _, local := range []string{"2026-03-08T02:30", "2026-11-01T01:30"} {
		task.DueLocal = local
		task.DueAt = ""
		if _, err = w.SaveTask(task); err == nil {
			t.Fatal("ambiguous/nonexistent time accepted", local)
		}
	}
	for _, invalid := range []WorkTask{{Title: "x", DueDate: "2026-03-01", DueAt: "2026-03-01T00:00:00Z"}, {Title: "x", Timezone: "bad"}, {Title: "x", Date: "2026-04-02", EndDate: "2026-04-01"}} {
		if _, err = w.SaveTask(invalid); err == nil {
			t.Fatal("invalid accepted", invalid)
		}
	}
}

func TestPlannerImportRollback(t *testing.T) {
	profile := t.TempDir()
	raw := []byte(`{"tasks":[{"id":"x","title":"a"},{"id":"x","title":"b"}],"notes":[]}`)
	if err := os.WriteFile(filepath.Join(profile, "work.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	store := storage.New(profile)
	defer store.Close()
	w := New(profile, store)
	if _, err := w.Tasks(); err == nil {
		t.Fatal("duplicate legacy ID accepted")
	}
	db, _ := store.DB()
	var count int
	for _, table := range []string{"planner_items", "import_receipts", "domain_events"} {
		if err := db.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("partial import %s %d %v", table, count, err)
		}
	}
}
