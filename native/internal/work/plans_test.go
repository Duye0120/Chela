package work

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func TestPlanReviewConflictAndCommit(t *testing.T) {
	profile := t.TempDir()
	store := storage.New(profile)
	defer store.Close()
	w := New(profile, store)
	task, err := w.SaveTask(WorkTask{Title: "要安排的任务", DueDate: "2026-12-31"})
	if err != nil {
		t.Fatal(err)
	}
	db, _ := store.DB()
	assistant, _ := store.Identity()
	if _, err = db.Exec("INSERT INTO sessions(session_id,assistant_id,kind,title,created_at) VALUES('plan-session',?,'user','计划',?)", assistant, storage.Now()); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("INSERT INTO branches(branch_id,session_id,created_at) VALUES('plan-branch','plan-session',?)", storage.Now()); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO messages(message_id,session_id,branch_id,role,content_json,created_at) VALUES('plan-message','plan-session','plan-branch','user','{"content":"帮我安排这周"}',?)`, storage.Now()); err != nil {
		t.Fatal(err)
	}
	propose := func() PlanDraft {
		var plan PlanDraft
		err := store.Update(context.Background(), func(tx *sql.Tx) error {
			var e error
			plan, e = ProposePlan(tx, PlanDraft{Changes: []PlanChange{{ItemID: task.ID, Date: "2026-12-01", Timezone: "Asia/Taipei", EstimateMinutes: 60}}}, "plan-session", "", "plan-message")
			return e
		})
		if err != nil {
			t.Fatal(err)
		}
		return plan
	}
	plan := propose()
	tasks, _ := w.Tasks()
	if tasks[0].Date != "" {
		t.Fatal("proposal wrote calendar")
	}
	if _, err = w.SaveTask(WorkTask{Title: "无关任务", Date: "2027-01-01"}); err != nil {
		t.Fatal(err)
	}
	if err = w.CommitPlan(plan.ID, plan.Revision); err != nil {
		t.Fatal(err)
	}
	if err = w.CommitPlan(plan.ID, plan.Revision); err != nil {
		t.Fatal("repeat commit", err)
	}
	tasks, _ = w.Tasks()
	for _, item := range tasks {
		if item.ID == task.ID {
			task = item
		}
	}
	if task.Date != "2026-12-01" || task.DueDate != "2026-12-31" || task.Status == "已完成" {
		t.Fatal("plan altered unrelated state", task)
	}
	plan = propose()
	task.Title = "已更新"
	if task, err = w.SaveTask(task); err != nil {
		t.Fatal(err)
	}
	if err = w.CommitPlan(plan.ID, plan.Revision); err == nil {
		t.Fatal("stale item version accepted")
	}
	plan = propose()
	if _, err = w.SaveTask(WorkTask{Title: "新增冲突", Date: "2026-12-01", Timezone: "Asia/Taipei"}); err != nil {
		t.Fatal(err)
	}
	if err = w.CommitPlan(plan.ID, plan.Revision); err == nil {
		t.Fatal("changed calendar range accepted")
	}
	var state string
	if err = db.QueryRow("SELECT state FROM plan_drafts WHERE draft_id=?", plan.ID).Scan(&state); err != nil || state != "draft" {
		t.Fatal("failed commit changed draft", state, err)
	}
}

func TestMultipleScheduleBlocksAndPlanConflicts(t *testing.T) {
	profile := t.TempDir()
	store := storage.New(profile)
	defer store.Close()
	w := New(profile, store)
	block := func(start, end string) ScheduleBlock {
		return ScheduleBlock{LocalStart: start, LocalEnd: end, Timezone: "Asia/Taipei", Binding: "floating_local"}
	}
	task, err := w.SaveTask(WorkTask{Title: "拆分工作", DueDate: "2026-12-31", Blocks: []ScheduleBlock{block("2026-12-01T09:00", "2026-12-01T10:00"), block("2026-12-02T14:00", "2026-12-02T15:00")}})
	if err != nil {
		t.Fatal(err)
	}
	if len(task.Blocks) != 2 || task.Blocks[0].ID == "" || task.Date != "" {
		t.Fatal(task)
	}
	stale := task
	stale.Blocks = append([]ScheduleBlock{}, task.Blocks...)
	task.Blocks[0].Locked = true
	task, err = w.SaveTask(task)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = w.SaveTask(stale); err == nil {
		t.Fatal("stale edit accepted")
	}
	bad := task
	bad.Blocks = append([]ScheduleBlock{}, task.Blocks...)
	bad.Blocks[0].LocalEnd = "2026-12-01T11:00"
	if _, err = w.SaveTask(bad); err == nil {
		t.Fatal("locked block moved")
	}
	bad = task
	bad.Blocks = []ScheduleBlock{}
	if _, err = w.SaveTask(bad); err == nil {
		t.Fatal("locked block deleted")
	}
	task.Blocks[0].Locked = false
	task, err = w.SaveTask(task)
	if err != nil {
		t.Fatal(err)
	}
	task.Blocks = task.Blocks[1:]
	task, err = w.SaveTask(task)
	if err != nil || len(task.Blocks) != 1 || task.DueDate != "2026-12-31" || task.Status == "已完成" {
		t.Fatal(task, err)
	}
	for _, wall := range []string{"2026-03-08T02:30", "2026-11-01T01:30"} {
		b := block(wall, "2026-11-01T03:00")
		b.Timezone = "America/New_York"
		if normalizeBlock(&b) == nil {
			t.Fatal("ambiguous wall time accepted", wall)
		}
	}
	day := ScheduleBlock{LocalStart: "2026-03-08", LocalEnd: "2026-03-09", Timezone: "America/New_York", AllDay: true}
	if err = normalizeBlock(&day); err != nil {
		t.Fatal(err)
	}
	start, _ := time.Parse(time.RFC3339, day.StartAt)
	end, _ := time.Parse(time.RFC3339, day.EndAt)
	if end.Sub(start) != 23*time.Hour {
		t.Fatal("all day lost DST", day)
	}
	absolute := ScheduleBlock{Binding: "absolute_instant", StartAt: "2026-12-01T09:00:00+08:00", EndAt: "2026-12-01T10:00:00+08:00", Timezone: "America/New_York"}
	if err = normalizeBlock(&absolute); err != nil || absolute.StartAt != "2026-12-01T01:00:00.000Z" {
		t.Fatal(absolute, err)
	}
	db, _ := store.DB()
	assistant, _ := store.Identity()
	_, err = db.Exec("INSERT INTO sessions(session_id,assistant_id,kind,title,created_at) VALUES('s',?,'user','计划',?)", assistant, storage.Now())
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec("INSERT INTO branches(branch_id,session_id,created_at) VALUES('b','s',?)", storage.Now())
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO messages(message_id,session_id,branch_id,role,content_json,created_at) VALUES('m','s','b','user','{"content":"安排"}',?)`, storage.Now())
	if err != nil {
		t.Fatal(err)
	}
	_, err = w.SaveTask(WorkTask{Title: "已有会议", Kind: "calendar_event", Blocks: []ScheduleBlock{block("2026-12-03T10:00", "2026-12-03T11:00")}})
	if err != nil {
		t.Fatal(err)
	}
	var p PlanDraft
	err = store.Update(context.Background(), func(tx *sql.Tx) error {
		var e error
		p, e = ProposePlan(tx, PlanDraft{Changes: []PlanChange{{ItemID: task.ID, Timezone: "Asia/Taipei", Blocks: []ScheduleBlock{block("2026-12-03T10:30", "2026-12-03T12:00"), block("2026-12-04T13:00", "2026-12-04T14:00")}}}}, "s", "", "m")
		return e
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Conflicts) != 1 || !strings.Contains(p.Conflicts[0], "已有会议") {
		t.Fatal(p)
	}
	if err = w.CommitPlan(p.ID, p.Revision); err == nil {
		t.Fatal("overlap committed")
	}
	p.Changes[0].Blocks[0].LocalStart = "2026-12-03T11:00"
	p, err = w.UpdatePlan(p)
	if err != nil || len(p.Conflicts) != 0 {
		t.Fatal(p, err)
	}
	if err = w.CommitPlan(p.ID, p.Revision); err != nil {
		t.Fatal(err)
	}
	if err = w.CommitPlan(p.ID, p.Revision); err != nil {
		t.Fatal(err)
	}
	items, err := w.Tasks()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.ID == task.ID && (len(item.Blocks) != 2 || item.DueDate != "2026-12-31") {
			t.Fatal(item)
		}
	}
}
