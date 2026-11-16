package work

import (
	"testing"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func TestReminderDeliverySnoozeAndCompletion(t *testing.T) {
	profile := t.TempDir()
	store := storage.New(profile)
	defer store.Close()
	w := New(profile, store)
	task, err := w.SaveTask(WorkTask{Title: "提醒烟测", Date: "2026-12-01", DueDate: "2026-12-05"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	r, err := w.SaveReminder(Reminder{ID: "rule", ItemID: task.ID, Kind: "once", Local: now.Add(2 * time.Minute).Format("2006-01-02T15:04"), Timezone: "UTC", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	fire, _ := time.Parse(time.RFC3339, r.Next)
	for i := 0; i < 2; i++ {
		if err = Tick(store, fire.Add(time.Second)); err != nil {
			t.Fatal(err)
		}
	}
	inbox, err := w.Notifications()
	if err != nil || len(inbox) != 1 {
		t.Fatalf("dedupe %v %v", inbox, err)
	}
	for i := 0; i < 2; i++ {
		if err = w.RespondNotification(inbox[0].ID, "snooze", "snooze-1"); err != nil {
			t.Fatal(err)
		}
	}
	db, _ := store.DB()
	var generation int
	var until string
	if err = db.QueryRow("SELECT snooze_generation,snooze_until FROM schedule_occurrences").Scan(&generation, &until); err != nil || generation != 1 {
		t.Fatalf("snooze %d %v", generation, err)
	}
	if err = Tick(store, now.Add(5*time.Minute)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	if len(inbox) != 1 {
		t.Fatal("snoozed too early")
	}
	next, _ := time.Parse(time.RFC3339, until)
	if err = Tick(store, next.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	if len(inbox) != 2 || inbox[0].ID == inbox[1].ID {
		t.Fatalf("new generation missing %+v", inbox)
	}
	tasks, _ := w.Tasks()
	if tasks[0].Date != task.Date || tasks[0].DueDate != task.DueDate || tasks[0].Status == "已完成" {
		t.Fatal("snooze changed task")
	}
	task.Status = "已完成"
	if _, err = w.SaveTask(task); err != nil {
		t.Fatal(err)
	}
	if err = Tick(store, next.Add(2*time.Second)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	for _, item := range inbox {
		if item.Status == "pending" {
			t.Fatal("completed task notification not revoked")
		}
	}
}

func TestReminderDSTAndCatchUp(t *testing.T) {
	for _, test := range []struct{ local, want string }{{"2026-03-08T02:30", "2026-03-08T07:00:00Z"}, {"2026-11-01T01:30", "2026-11-01T05:30:00Z"}} {
		got, err := reminderWall(test.local, "America/New_York")
		if err != nil || got.Format(time.RFC3339) != test.want {
			t.Fatalf("DST %s %v %v", test.local, got, err)
		}
	}
	profile := t.TempDir()
	store := storage.New(profile)
	defer store.Close()
	w := New(profile, store)
	task, err := w.SaveTask(WorkTask{Title: "错过提醒"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	for _, policy := range []string{"within_grace", "skip", "current_day_once"} {
		_, err = w.SaveReminder(Reminder{ID: policy, ItemID: task.ID, Kind: "daily", Local: now.Add(time.Minute).Format("2006-01-02T15:04"), Timezone: "UTC", Enabled: true, CatchUp: policy})
		if err != nil {
			t.Fatal(err)
		}
	}
	db, _ := store.DB()
	scheduled := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if _, err = db.Exec("UPDATE reminder_rules SET next_fire_at=?", utc(scheduled)); err != nil {
		t.Fatal(err)
	}
	if err = Tick(store, scheduled.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	inbox, err := w.Notifications()
	if err != nil || len(inbox) != 1 {
		t.Fatalf("catchup %v %v", inbox, err)
	}
	if err = Tick(store, scheduled.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM deliveries").Scan(&count); err != nil || count != 1 {
		t.Fatalf("catchup repeated %d %v", count, err)
	}
}

func TestReminderMissedDaysAndLateSnooze(t *testing.T) {
	profile := t.TempDir()
	store := storage.New(profile)
	defer store.Close()
	w := New(profile, store)
	task, err := w.SaveTask(WorkTask{Title: "每天提醒"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	firstLocal := time.Date(now.Year(), now.Month(), now.Day()+1, 9, 0, 0, 0, time.UTC)
	r, err := w.SaveReminder(Reminder{ID: "daily", ItemID: task.ID, Kind: "daily", Local: firstLocal.Format("2006-01-02T15:04"), Timezone: "UTC", Enabled: true, CatchUp: "current_day_once"})
	if err != nil {
		t.Fatal(err)
	}
	first, _ := time.Parse(time.RFC3339, r.Next)
	later := first.AddDate(0, 0, 5).Add(time.Hour)
	if err = Tick(store, later); err != nil {
		t.Fatal(err)
	}
	inbox, err := w.Notifications()
	if err != nil || len(inbox) != 1 {
		t.Fatalf("current day omitted %v %v", inbox, err)
	}
	db, _ := store.DB()
	var scheduled string
	if err = db.QueryRow("SELECT scheduled_at FROM schedule_occurrences").Scan(&scheduled); err != nil || scheduled[:10] != utc(later)[:10] {
		t.Fatalf("old day caught up %s %v", scheduled, err)
	}
	if err = w.RespondNotification(inbox[0].ID, "snooze", "late-snooze"); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("UPDATE reminder_rules SET next_fire_at=NULL"); err != nil {
		t.Fatal(err)
	}
	if err = Tick(store, later.AddDate(0, 0, 2)); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM deliveries").Scan(&count); err != nil || count != 1 {
		t.Fatalf("stale snooze fired %d %v", count, err)
	}
}
