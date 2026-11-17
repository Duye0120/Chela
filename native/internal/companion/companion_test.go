package companion

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
)

func TestPresentationMergeReconnectPriorityAndRevocation(t *testing.T) {
	profile := t.TempDir()
	s := storage.New(profile)
	defer func() { s.Close() }()
	w := work.New(profile, s)
	assistant, err := s.Identity()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	tasks := []work.WorkTask{}
	for i := 0; i < 2; i++ {
		task, e := w.SaveTask(work.WorkTask{Title: fmt.Sprintf("等待 %d", i), Status: "进行中"})
		if e != nil {
			t.Fatal(e)
		}
		tasks = append(tasks, task)
		if e = s.Update(context.Background(), func(tx *sql.Tx) error {
			_, e := SaveAttention(tx, Attention{Goal: task.Title, Condition: Condition{Kind: "task_status", ItemID: task.ID, Status: "doing"}}, assistant, "", "", true)
			return e
		}); e != nil {
			t.Fatal(e)
		}
	}
	if err = Tick(s, now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Minute)
	next := func(presence Presence) *Presentation {
		t.Helper()
		var p *Presentation
		err = s.Update(context.Background(), func(tx *sql.Tx) error {
			var e error
			p, e = NextPresentation(tx, assistant, presence, now.Add(2*time.Second))
			return e
		})
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	for _, presence := range []Presence{{Locked: true}, {Fullscreen: true}, {Hidden: true}, {Busy: true}} {
		if p := next(presence); p != nil {
			t.Fatal("presented while suppressed", presence)
		}
	}
	items, err := w.Notifications()
	if err != nil || len(items) != 2 {
		t.Fatal(items, err)
	}
	for _, d := range items {
		if d.Status == "presented" {
			t.Fatal("suppression counted as display")
		}
	}
	db, _ := s.DB()
	if _, err = db.Exec("UPDATE deliveries SET surface='workspace'"); err != nil {
		t.Fatal(err)
	}
	if p := next(Presence{}); p != nil {
		t.Fatal("workspace-only confidence promoted to pet", p)
	}
	if _, err = db.Exec("UPDATE deliveries SET surface='pet'"); err != nil {
		t.Fatal(err)
	}
	p := next(Presence{})
	if p == nil || len(p.Items) != 2 || p.Acknowledged {
		t.Fatalf("merged presentation %+v", p)
	}
	id := p.ID
	// Lost response before UI acknowledgement: reopening preserves the offered ID.
	s.Close()
	s = storage.New(profile)
	w = work.New(profile, s)
	p = next(Presence{})
	if p == nil || p.ID != id || p.Acknowledged {
		t.Fatal("lost offer replayed as new", p)
	}
	for i := 0; i < 2; i++ {
		if err = s.Update(context.Background(), func(tx *sql.Tx) error { return AcknowledgePresentation(tx, id, now.Add(2*time.Second)) }); err != nil {
			t.Fatal(err)
		}
	}
	s.Close()
	s = storage.New(profile)
	w = work.New(profile, s)
	p = next(Presence{})
	if p == nil || p.ID != id || !p.Acknowledged {
		t.Fatal("acknowledged presentation lost", p)
	}
	reminder, err := w.SaveReminder(work.Reminder{ID: "priority-rule", ItemID: tasks[0].ID, Kind: "once", Local: now.Add(2 * time.Minute).Format("2006-01-02T15:04"), Timezone: "UTC", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	fire, err := time.Parse(time.RFC3339Nano, reminder.Next)
	if err != nil {
		t.Fatal(err)
	}
	now = fire
	if err = work.Tick(s, fire); err != nil {
		t.Fatal(err)
	}
	p = next(Presence{})
	if p == nil || p.ID == id || len(p.Items) != 1 || p.Items[0].Purpose != "reminder" {
		t.Fatal("explicit reminder did not take priority", p)
	}
	reminderID := p.ID
	if err = s.Update(context.Background(), func(tx *sql.Tx) error {
		cfg, e := LoadSettings(tx, assistant)
		if e != nil {
			return e
		}
		cfg.ReminderException = true
		_, e = SaveSettings(tx, assistant, cfg)
		return e
	}); err != nil {
		t.Fatal(err)
	}
	if p = next(Presence{Fullscreen: true}); p == nil || p.ID != reminderID {
		t.Fatal("configured exception missing", p)
	}
	if p = next(Presence{Locked: true}); p != nil {
		t.Fatal("lock screen bypassed")
	}
	if err = w.DeleteTask(tasks[0].ID); err != nil {
		t.Fatal(err)
	}
	if p = next(Presence{}); p != nil {
		t.Fatal("deleted reminder still presented", p)
	}
	// A workspace response also closes the active presentation without completing a task.
	if err = w.RespondNotification(items[1].ID, "dismissed", "workspace-dismiss"); err != nil {
		t.Fatal(err)
	}
	now = now.Add(2 * time.Minute)
	if p = next(Presence{}); p != nil {
		t.Fatal("dismissed/previously displayed fact popped again", p)
	}
	remaining, err := w.Tasks()
	if err != nil || len(remaining) != 1 || remaining[0].Status != "进行中" {
		t.Fatal("display altered task completion", remaining, err)
	}
}

func TestArtifactsAndDeadlineTriggerWithoutNewMessages(t *testing.T) {
	profile := t.TempDir()
	s := storage.New(profile)
	defer s.Close()
	w := work.New(profile, s)
	assistant, _ := s.Identity()
	workspace := t.TempDir()
	now := time.Now().UTC()
	db, _ := s.DB()
	if _, err := db.Exec("INSERT INTO projects(project_id,assistant_id,name,workspace_path) VALUES('p',?,'截图项目',?)", assistant, workspace); err != nil {
		t.Fatal(err)
	}
	var a Attention
	err := s.Update(context.Background(), func(tx *sql.Tx) error {
		var e error
		a, e = SaveAttention(tx, Attention{Goal: "等三张截图到齐", ScopeType: "project", ScopeID: "p", Condition: Condition{Kind: "all_artifacts_present", Paths: []string{"一.png", "二.png", "三.png"}}}, assistant, "", "", true)
		return e
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"一.png", "二.png"} {
		if err = os.WriteFile(filepath.Join(workspace, name), []byte("fixture"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err = Tick(s, now); err != nil {
		t.Fatal(err)
	}
	inbox, _ := w.Notifications()
	if len(inbox) != 0 {
		t.Fatal("incomplete artifacts notified")
	}
	if err = os.WriteFile(filepath.Join(workspace, "三.png"), []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	if err = Tick(s, now.Add(16*time.Minute)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	if len(inbox) != 1 {
		t.Fatal("artifacts not noticed", inbox)
	}
	if err = os.Remove(filepath.Join(workspace, "三.png")); err != nil {
		t.Fatal(err)
	}
	if err = Tick(s, now.Add(17*time.Minute)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	if len(inbox) != 0 {
		t.Fatal("removed artifact still deliverable")
	}
	a.Condition.Paths = []string{"../outside"}
	err = s.Update(context.Background(), func(tx *sql.Tx) error { _, e := SaveAttention(tx, a, assistant, "", "", true); return e })
	if err == nil {
		t.Fatal("path escape accepted")
	}
	task, err := w.SaveTask(work.WorkTask{Title: "时间边界", DueAt: stamp(now.Add(2 * time.Hour)), Timezone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	err = s.Update(context.Background(), func(tx *sql.Tx) error {
		_, e := SaveAttention(tx, Attention{Goal: "期限前一小时", Condition: Condition{Kind: "deadline_approaching", ItemID: task.ID, MinutesBefore: 60}}, assistant, "", "", true)
		return e
	})
	if err != nil {
		t.Fatal(err)
	}
	if err = Tick(s, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	if len(inbox) != 0 {
		t.Fatal("deadline too early")
	}
	if err = Tick(s, now.Add(61*time.Minute)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	if len(inbox) != 1 {
		t.Fatal("clock crossing lost by fingerprint", inbox)
	}
	if err = Tick(s, now.Add(80*time.Minute)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	if len(inbox) != 1 {
		t.Fatal("same deadline repeated", inbox)
	}
}

func TestAffectDedupeDecayRollbackAndRestart(t *testing.T) {
	profile := t.TempDir()
	s := storage.New(profile)
	defer func() { _ = s.Close() }()
	assistant, err := s.Identity()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Millisecond)
	cause := ""
	apply := func(label string, at time.Time, confidence float64, newCause bool) (Affect, error) {
		var a Affect
		err := s.Update(context.Background(), func(tx *sql.Tx) error {
			if newCause {
				seq, e := storage.AppendEvent(tx, assistant, "memory.source", "message", rand.Text(), 1, "assistant", assistant, "test", map[string]string{})
				if e != nil {
					return e
				}
				if e = tx.QueryRow("SELECT event_id FROM domain_events WHERE seq=?", seq).Scan(&cause); e != nil {
					return e
				}
			}
			var e error
			a, e = Apply(tx, assistant, Appraisal{Cause: cause, Label: label, Intensity: 1, Confidence: confidence, PersonaVersion: 1}, "cluster", at)
			return e
		})
		return a, err
	}
	a, err := apply("praise", now, 1, true)
	if err != nil || a.Revision != 1 || a.Scores.Joy != 22 {
		t.Fatalf("first %+v %v", a, err)
	}
	a, err = apply("praise", now, 1, false)
	if err != nil || a.Revision != 1 || a.Scores.Joy != 22 {
		t.Fatalf("duplicate %+v %v", a, err)
	}
	a, err = apply("praise", now.Add(time.Second), 1, true)
	if err != nil || a.Revision != 1 {
		t.Fatalf("cooldown %+v %v", a, err)
	}
	a, err = apply("friendly_teasing", now.Add(time.Minute), .5, true)
	if err != nil || a.Revision != 1 {
		t.Fatalf("ambiguous %+v %v", a, err)
	}
	db, _ := s.DB()
	var n int
	if err = db.QueryRow("SELECT count(*) FROM affect_events").Scan(&n); err != nil || n != 3 {
		t.Fatalf("receipts %d %v", n, err)
	}
	err = s.Update(context.Background(), func(tx *sql.Tx) error {
		seq, e := storage.AppendEvent(tx, assistant, "memory.source", "message", "rollback", 1, "assistant", assistant, "test", nil)
		if e != nil {
			return e
		}
		var id string
		if e = tx.QueryRow("SELECT event_id FROM domain_events WHERE seq=?", seq).Scan(&id); e != nil {
			return e
		}
		if _, e = Apply(tx, assistant, Appraisal{Cause: id, Label: "praise", Intensity: 1, Confidence: 1, PersonaVersion: 1}, "other", now); e != nil {
			return e
		}
		return errors.New("rollback")
	})
	if err == nil {
		t.Fatal("rollback missing")
	}
	if err = db.QueryRow("SELECT count(*) FROM affect_events").Scan(&n); err != nil || n != 3 {
		t.Fatal("rollback leaked", err)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s = storage.New(profile)
	defer s.Close()
	err = s.Update(context.Background(), func(tx *sql.Tx) error {
		var e error
		a, e = LoadAffect(tx, assistant, now.Add(30*time.Minute))
		return e
	})
	if err != nil || math.Abs(a.Scores.Joy-17) > .01 {
		t.Fatalf("offline decay %+v %v", a, err)
	}
	if Decay(Scores{Playful: 10}, 5*time.Minute, 1).Playful != 5 {
		t.Fatal("half life")
	}
	a, err = apply("praise", now.Add(24*time.Hour), 1, true)
	if err != nil || a.Revision != 1 {
		t.Fatalf("late pulse %+v %v", a, err)
	}
}

func TestAttentionQuietDismissAndSourceRecheck(t *testing.T) {
	profile := t.TempDir()
	s := storage.New(profile)
	defer s.Close()
	w := work.New(profile, s)
	task, err := w.SaveTask(work.WorkTask{Title: "等待进展"})
	if err != nil {
		t.Fatal(err)
	}
	assistant, _ := s.Identity()
	now := time.Now().UTC()
	var a Attention
	err = s.Update(context.Background(), func(tx *sql.Tx) error {
		var e error
		a, e = SaveAttention(tx, Attention{Goal: "事项进行中时提醒", Condition: Condition{Kind: "task_status", ItemID: task.ID, Status: "doing"}}, assistant, "", "", true)
		if e != nil {
			return e
		}
		cfg, e := LoadSettings(tx, assistant)
		if e != nil {
			return e
		}
		cfg.GameMode = true
		_, e = SaveSettings(tx, assistant, cfg)
		return e
	})
	if err != nil {
		t.Fatal(err)
	}
	task.Status = "进行中"
	task, err = w.SaveTask(task)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if err = Tick(s, now.Add(time.Minute)); err != nil {
			t.Fatal(err)
		}
	}
	inbox, err := w.Notifications()
	if err != nil || len(inbox) != 1 || inbox[0].Status != "deferred" {
		t.Fatalf("quiet %+v %v", inbox, err)
	}
	if err = w.RespondNotification(inbox[0].ID, "dismissed", "dismiss"); err != nil {
		t.Fatal(err)
	}
	err = s.Update(context.Background(), func(tx *sql.Tx) error {
		cfg, e := LoadSettings(tx, assistant)
		if e != nil {
			return e
		}
		cfg.GameMode = false
		_, e = SaveSettings(tx, assistant, cfg)
		return e
	})
	if err != nil {
		t.Fatal(err)
	}
	if err = Tick(s, now.Add(20*time.Minute)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	if len(inbox) != 1 || inbox[0].Status != "dismissed" {
		t.Fatal("dismissed fact replayed", inbox)
	}
	task.Title = "进展更新"
	task, err = w.SaveTask(task)
	if err != nil {
		t.Fatal(err)
	}
	if err = Tick(s, now.Add(21*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err = w.DeleteTask(task.ID); err != nil {
		t.Fatal(err)
	}
	if err = Tick(s, now.Add(22*time.Minute)); err != nil {
		t.Fatal(err)
	}
	inbox, _ = w.Notifications()
	if len(inbox) != 1 {
		t.Fatal("stale source presented", inbox)
	}
	db, _ := s.DB()
	var state string
	if err = db.QueryRow("SELECT state FROM attention_items WHERE attention_id=?", a.ID).Scan(&state); err != nil || state != "expired" {
		t.Fatal(state, err)
	}
	var calls int
	if err = db.QueryRow("SELECT count(*) FROM model_requests").Scan(&calls); err != nil || calls != 0 {
		t.Fatal("deterministic tick called model", err)
	}
}

func TestDailyReportAndExplicitReminderUnderQuiet(t *testing.T) {
	profile := t.TempDir()
	s := storage.New(profile)
	defer s.Close()
	w := work.New(profile, s)
	now := time.Now().UTC()
	task, err := w.SaveTask(work.WorkTask{Title: "到期任务", DueDate: now.Format(time.DateOnly)})
	if err != nil {
		t.Fatal(err)
	}
	r, err := w.SaveReminder(work.Reminder{ID: "rule", ItemID: task.ID, Kind: "once", Local: now.Add(2 * time.Minute).Format("2006-01-02T15:04"), Timezone: "UTC", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	fire, _ := time.Parse(time.RFC3339Nano, r.Next)
	assistant, _ := s.Identity()
	err = s.Update(context.Background(), func(tx *sql.Tx) error {
		cfg, e := LoadSettings(tx, assistant)
		if e != nil {
			return e
		}
		cfg.GameMode = true
		cfg.ReminderException = true
		cfg.DailyReport = true
		cfg.ReportTime = "00:00"
		_, e = SaveSettings(tx, assistant, cfg)
		return e
	})
	if err != nil {
		t.Fatal(err)
	}
	if err = work.Tick(s, fire.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if err = Tick(s, fire.Add(time.Second)); err != nil {
			t.Fatal(err)
		}
	}
	inbox, err := w.Notifications()
	if err != nil || len(inbox) != 2 {
		t.Fatalf("deliveries %+v %v", inbox, err)
	}
	for _, d := range inbox {
		want := "deferred"
		if d.Purpose == "reminder" {
			want = "pending"
		}
		if d.Status != want {
			t.Fatalf("quiet rule %+v", d)
		}
	}
	db, _ := s.DB()
	var raw string
	if err = db.QueryRow("SELECT fact_snapshot_json FROM daily_reports").Scan(&raw); err != nil || !json.Valid([]byte(raw)) {
		t.Fatal("report snapshot", err)
	}
	if !Quiet(Settings{Timezone: "UTC", QuietStart: "23:00", QuietEnd: "08:00"}, time.Date(2026, 1, 1, 2, 0, 0, 0, time.UTC)) {
		t.Fatal("overnight quiet")
	}
}

func TestDailyReportGroupsFactsWithoutCompletingTasks(t *testing.T) {
	profile := t.TempDir()
	s := storage.New(profile)
	defer s.Close()
	w := work.New(profile, s)
	now := time.Now().UTC()
	yesterday := now.AddDate(0, 0, -1).Format(time.DateOnly)
	done, e := w.SaveTask(work.WorkTask{Title: "昨天真的完成", Status: "已完成"})
	if e != nil {
		t.Fatal(e)
	}
	left, e := w.SaveTask(work.WorkTask{Title: "昨天遗留", Date: yesterday})
	if e != nil {
		t.Fatal(e)
	}
	_, e = w.SaveTask(work.WorkTask{Title: "今天已安排", Date: now.Format(time.DateOnly)})
	if e != nil {
		t.Fatal(e)
	}
	db, _ := s.DB()
	assistant, _ := s.Identity()
	if _, e = db.Exec("UPDATE planner_items SET completed_at=? WHERE item_id=?", yesterday+"T12:00:00.000Z", done.ID); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(`INSERT INTO terminal_sessions(terminal_session_id,assistant_id,executor_kind,adapter_version,cwd,process_ownership,process_state,capabilities_json,created_at) VALUES('term',?,'codex','fixture','C:/project','chela','exited','{}',?)`, assistant, storage.Now()); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec("INSERT INTO execution_links VALUES('link',?,NULL,'term',?)", left.ID, storage.Now()); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(`INSERT INTO execution_observations(observation_id,terminal_session_id,source_event_key,evidence_format,kind,result_ref,result_version,payload_json,observed_at) VALUES('reply','term','reply','fixture','reply_available','ref',1,'{}',?)`, storage.Now()); e != nil {
		t.Fatal(e)
	}
	err := s.Update(context.Background(), func(tx *sql.Tx) error {
		cfg, e := LoadSettings(tx, assistant)
		if e != nil {
			return e
		}
		cfg.DailyReport = true
		cfg.ReportTime = "00:00"
		cfg.Timezone = "UTC"
		if _, e = SaveSettings(tx, assistant, cfg); e != nil {
			return e
		}
		return dailyReport(tx, now)
	})
	if err != nil {
		t.Fatal(err)
	}
	var raw string
	if e = db.QueryRow("SELECT fact_snapshot_json FROM daily_reports").Scan(&raw); e != nil {
		t.Fatal(e)
	}
	var groups map[string]json.RawMessage
	if e = json.Unmarshal([]byte(raw), &groups); e != nil {
		t.Fatal(e)
	}
	for _, key := range []string{"completed", "leftover", "today", "cliResults"} {
		var entries []any
		if e = json.Unmarshal(groups[key], &entries); e != nil || len(entries) != 1 {
			t.Fatal(key, string(groups[key]), e)
		}
	}
	err = s.Update(context.Background(), func(tx *sql.Tx) error {
		p, e := NextPresentation(tx, assistant, Presence{}, now)
		if e != nil {
			return e
		}
		if p == nil || len(p.Items) != 1 || p.Items[0].Report == nil || len(p.Items[0].Report.Today) != 1 || p.Items[0].Report.Today[0].Title != "今天已安排" {
			t.Fatalf("presentation omitted report facts: %+v", p)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, e = db.Exec(`INSERT INTO execution_observations(observation_id,terminal_session_id,source_event_key,evidence_format,kind,result_ref,result_version,payload_json,observed_at) VALUES('seen','term','seen','fixture','reply_seen','ref',1,'{}',?)`, storage.Now()); e != nil {
		t.Fatal(e)
	}
	err = s.Update(context.Background(), func(tx *sql.Tx) error { _, e := Reports(tx); return e })
	if err != nil {
		t.Fatal(err)
	}
	var deliveries, unread int
	if e = db.QueryRow("SELECT count(*) FROM deliveries WHERE purpose='daily_report'").Scan(&deliveries); e != nil {
		t.Fatal(e)
	}
	if e = db.QueryRow("SELECT json_array_length(fact_snapshot_json,'$.cliResults') FROM daily_reports").Scan(&unread); e != nil || deliveries != 1 || unread != 0 {
		t.Fatal(deliveries, unread, e)
	}
	tasks, _ := w.Tasks()
	for _, task := range tasks {
		if task.ID == left.ID && task.Status == "已完成" {
			t.Fatal("report completed task")
		}
	}
}

func TestCompanionshipOptInQuotaAndRevocation(t *testing.T) {
	s := storage.New(t.TempDir())
	defer s.Close()
	assistant, _ := s.Identity()
	now := time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC)
	source := func(id string, at time.Time) {
		t.Helper()
		db, _ := s.DB()
		if _, e := db.Exec("INSERT INTO sessions(session_id,assistant_id,kind,title,created_at) VALUES(?,?,'user','交流',?)", id, assistant, stamp(at)); e != nil {
			t.Fatal(e)
		}
		if _, e := db.Exec("INSERT INTO branches(branch_id,session_id,created_at) VALUES(?,?,?)", id+"-main", id, stamp(at)); e != nil {
			t.Fatal(e)
		}
		if _, e := db.Exec(`INSERT INTO messages(message_id,session_id,branch_id,role,content_json,created_at) VALUES(?,?,?,'user','{"content":"聊两句"}',?)`, id+"-m", id, id+"-main", stamp(at.Add(-10*time.Minute))); e != nil {
			t.Fatal(e)
		}
	}
	count := func(want int) {
		t.Helper()
		db, _ := s.DB()
		var n int
		if e := db.QueryRow("SELECT count(*) FROM deliveries WHERE purpose='companionship'").Scan(&n); e != nil || n != want {
			t.Fatal(n, want, e)
		}
	}
	tick := func(at time.Time) {
		t.Helper()
		if e := s.Update(context.Background(), func(tx *sql.Tx) error { return companionship(tx, at) }); e != nil {
			t.Fatal(e)
		}
	}
	settings := func(enabled bool, mode string) {
		t.Helper()
		if e := s.Update(context.Background(), func(tx *sql.Tx) error {
			cfg, e := LoadSettings(tx, assistant)
			if e != nil {
				return e
			}
			cfg.CompanionChat = enabled
			cfg.Mode = mode
			_, e = SaveSettings(tx, assistant, cfg)
			return e
		}); e != nil {
			t.Fatal(e)
		}
	}
	source("s1", now)
	tick(now)
	count(0)
	settings(true, "focused")
	tick(now)
	count(0)
	settings(true, "companion")
	tick(now)
	tick(now.Add(time.Minute))
	count(1)
	settings(false, "companion")
	db, _ := s.DB()
	var state string
	if e := db.QueryRow("SELECT status FROM deliveries WHERE purpose='companionship'").Scan(&state); e != nil || state != "revoked" {
		t.Fatal(state, e)
	}
	settings(true, "companion")
	next := now.Add(25 * time.Hour)
	source("s2", next)
	tick(next)
	count(2)
	third := next.Add(25 * time.Hour)
	source("s3", third)
	tick(third)
	count(2)
	settings(true, "focused")
	tick(third.AddDate(0, 0, 8))
	count(2)
}
