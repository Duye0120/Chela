package work

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type PlanChange struct {
	ItemID          string          `json:"itemId"`
	Title           string          `json:"title"`
	Date            string          `json:"date"`
	EndDate         string          `json:"endDate"`
	Timezone        string          `json:"timezone"`
	EstimateMinutes int             `json:"estimateMinutes"`
	Blocks          []ScheduleBlock `json:"blocks"`
}
type PlanDraft struct {
	ID        string       `json:"id"`
	Revision  int64        `json:"revision"`
	State     string       `json:"state"`
	SessionID string       `json:"sessionId"`
	Changes   []PlanChange `json:"changes"`
	Conflicts []string     `json:"conflicts"`
	versions  map[string]int64
	ranges    []planRange
}
type planRange struct {
	Start  string           `json:"start"`
	End    string           `json:"end"`
	Blocks map[string]int64 `json:"blocks"`
}

func PlannerSnapshot(tx *sql.Tx, project string) ([]WorkTask, error) {
	data, err := readWork(tx)
	if err != nil {
		return nil, err
	}
	tasks := []WorkTask{}
	for _, task := range data.Tasks {
		if task.ProjectID == "" || task.ProjectID == project {
			tasks = append(tasks, task)
		}
	}
	return tasks, nil
}

func readPlan(tx *sql.Tx, id string) (PlanDraft, error) {
	var p PlanDraft
	var changes, versions, ranges string
	err := tx.QueryRow("SELECT draft_id,revision,state,COALESCE(origin_session_id,''),changes_json,affected_versions_json,affected_ranges_json FROM plan_drafts WHERE draft_id=?", id).Scan(&p.ID, &p.Revision, &p.State, &p.SessionID, &changes, &versions, &ranges)
	if err != nil {
		return p, err
	}
	if err = json.Unmarshal([]byte(changes), &p.Changes); err != nil {
		return p, err
	}
	if err = json.Unmarshal([]byte(versions), &p.versions); err != nil {
		return p, err
	}
	err = json.Unmarshal([]byte(ranges), &p.ranges)
	if err == nil {
		p.Conflicts, err = planConflicts(tx, p)
	}
	return p, err
}

func planRangeSnapshot(tx *sql.Tx, start, end string) (map[string]int64, error) {
	rows, err := tx.Query("SELECT b.block_id,b.revision FROM schedule_blocks b JOIN planner_items p ON p.item_id=b.item_id WHERE p.deleted_at IS NULL AND p.status NOT IN ('done','cancelled') AND b.start_at<? AND b.end_at>?", end, start)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]int64{}
	for rows.Next() {
		var id string
		var rev int64
		if err = rows.Scan(&id, &rev); err != nil {
			return nil, err
		}
		result[id] = rev
	}
	return result, rows.Err()
}

func checkPlanSources(tx *sql.Tx, p PlanDraft) error {
	for id, revision := range p.versions {
		var current int64
		if err := tx.QueryRow("SELECT revision FROM planner_items WHERE item_id=? AND deleted_at IS NULL", id).Scan(&current); err != nil || current != revision {
			return fmt.Errorf("计划涉及的事项 %s 版本从 %d 变为 %d 或已删除，请检查并保存草案", id, revision, current)
		}
	}
	for _, r := range p.ranges {
		current, err := planRangeSnapshot(tx, r.Start, r.End)
		if err != nil {
			return err
		}
		before, _ := json.Marshal(r.Blocks)
		after, _ := json.Marshal(current)
		if string(before) != string(after) {
			return fmt.Errorf("时间段 %s — %s 的排期已改变（原 %d 块，现 %d 块），请检查并保存草案", r.Start, r.End, len(r.Blocks), len(current))
		}
	}
	return nil
}

// ProposePlan stores only a draft. The user commits its reviewed revision separately.
func ProposePlan(tx *sql.Tx, p PlanDraft, session, project, message string) (PlanDraft, error) {
	var assistant, raw string
	if err := tx.QueryRow("SELECT s.assistant_id,m.content_json FROM messages m JOIN sessions s ON s.session_id=m.session_id WHERE m.message_id=? AND m.session_id=? AND m.role='user' AND s.deleted_at IS NULL", message, session).Scan(&assistant, &raw); err != nil {
		return p, errors.New("计划缺少可核对的用户来源")
	}
	if p.ID != "" {
		old, err := readPlan(tx, p.ID)
		if err != nil {
			return p, err
		}
		if old.SessionID != session || old.Revision != p.Revision || old.State != "draft" {
			return p, errors.New("计划草案版本或所属会话不匹配")
		}
		if err = checkPlanSources(tx, old); err != nil {
			return p, err
		}
	} else {
		p.ID = rand.Text()
		p.Revision = 0
	}
	p.SessionID = session
	p.State = "draft"
	if err := preparePlan(tx, &p, project); err != nil {
		return p, err
	}
	p.Revision++
	changes, _ := json.Marshal(p.Changes)
	versions, _ := json.Marshal(p.versions)
	ranges, _ := json.Marshal(p.ranges)
	refs, _ := json.Marshal([]any{map[string]any{"source_type": "message", "source_id": message, "source_revision": 1, "payload_hash": storage.Hash([]byte(raw)), "scope": map[string]string{"type": "session", "id": session}}})
	_, err := tx.Exec(`INSERT INTO plan_drafts(draft_id,assistant_id,revision,state,affected_versions_json,affected_ranges_json,changes_json,source_refs_json,created_at,updated_at,origin_session_id) VALUES(?,?,?,'draft',?,?,?,?,?,?,?) ON CONFLICT(draft_id) DO UPDATE SET revision=excluded.revision,affected_versions_json=excluded.affected_versions_json,affected_ranges_json=excluded.affected_ranges_json,changes_json=excluded.changes_json,source_refs_json=excluded.source_refs_json,updated_at=excluded.updated_at`, p.ID, assistant, p.Revision, string(versions), string(ranges), string(changes), string(refs), storage.Now(), storage.Now(), session)
	return p, err
}

func preparePlan(tx *sql.Tx, p *PlanDraft, project string) error {
	if len(p.Changes) == 0 || len(p.Changes) > 40 {
		return errors.New("计划应包含 1–40 项安排")
	}
	p.versions = map[string]int64{}
	p.ranges = nil
	for index, change := range p.Changes {
		if change.ItemID != "" {
			if _, exists := p.versions[change.ItemID]; exists {
				return errors.New("同一事项在当前草案中重复，请合并排期")
			}
			var rev int64
			var currentProject, status string
			if err := tx.QueryRow("SELECT revision,COALESCE(project_id,''),status FROM planner_items WHERE item_id=? AND kind IN ('task','calendar_event') AND deleted_at IS NULL", change.ItemID).Scan(&rev, &currentProject, &status); err != nil {
				return errors.New("计划引用的事项已不存在")
			}
			if currentProject != "" && currentProject != project {
				return errors.New("计划不能跨越当前项目范围")
			}
			if status == "done" || status == "cancelled" {
				return errors.New("计划不能重新安排已完成或已取消的事项")
			}
			p.versions[change.ItemID] = rev
		} else if strings.TrimSpace(change.Title) == "" || len(change.Title) > 2000 {
			return errors.New("新任务需要有效标题")
		}
		if change.EstimateMinutes < 0 || change.EstimateMinutes > 7*24*60 {
			return errors.New("估时超出范围")
		}
		blocks, err := effectivePlanBlocks(tx, change)
		if err != nil {
			return err
		}
		if change.Blocks != nil {
			for i := range blocks {
				if change.EstimateMinutes > 0 && !blocks[i].Locked {
					blocks[i].EstimateSource = "model"
				}
			}
			p.Changes[index].Blocks = blocks
		}
		old, err := readBlocks(tx, change.ItemID)
		if err != nil {
			return err
		}
		for _, previous := range old {
			if !previous.Locked {
				continue
			}
			unchanged := false
			for _, b := range blocks {
				if b.ID == previous.ID && sameBlock(b, previous) {
					unchanged = true
				}
			}
			if !unchanged {
				return errors.New("计划包含锁定时间块，不能覆盖或删除")
			}
		}
		for _, b := range blocks {
			if b.ID != "" {
				found := false
				for _, previous := range old {
					if previous.ID == b.ID && (b.ID == "schedule-"+change.ItemID || previous.Revision == b.Revision) {
						found = true
					}
				}
				if !found && b.ID != "schedule-"+change.ItemID {
					return errors.New("计划引用的时间块版本或事项不匹配")
				}
			}
			snapshot, err := planRangeSnapshot(tx, b.StartAt, b.EndAt)
			if err != nil {
				return err
			}
			p.ranges = append(p.ranges, planRange{Start: b.StartAt, End: b.EndAt, Blocks: snapshot})
		}

	}
	var err error
	p.Conflicts, err = planConflicts(tx, *p)
	return err
}

func (w *Work) Plans() ([]PlanDraft, error) {
	if err := w.initialize(); err != nil {
		return nil, err
	}
	result := []PlanDraft{}
	err := w.store.Update(context.Background(), func(tx *sql.Tx) error {
		rows, err := tx.Query("SELECT draft_id FROM plan_drafts WHERE state='draft' ORDER BY updated_at DESC LIMIT 30")
		if err != nil {
			return err
		}
		var ids []string
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			ids = append(ids, id)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, id := range ids {
			p, err := readPlan(tx, id)
			if err != nil {
				return err
			}
			result = append(result, p)
		}
		return nil
	})
	return result, err
}

func (w *Work) UpdatePlan(p PlanDraft) (PlanDraft, error) {
	err := w.store.Update(context.Background(), func(tx *sql.Tx) error {
		old, err := readPlan(tx, p.ID)
		if err != nil {
			return err
		}
		if old.State != "draft" || old.Revision != p.Revision {
			return errors.New("计划已更改，请重新打开")
		}
		var project string
		if err = tx.QueryRow("SELECT COALESCE(project_id,'') FROM sessions WHERE session_id=?", old.SessionID).Scan(&project); err != nil {
			return err
		}
		p.SessionID = old.SessionID
		p.State = "draft"
		if err = preparePlan(tx, &p, project); err != nil {
			return err
		}
		p.Revision++
		changes, _ := json.Marshal(p.Changes)
		versions, _ := json.Marshal(p.versions)
		ranges, _ := json.Marshal(p.ranges)
		_, err = tx.Exec("UPDATE plan_drafts SET revision=?,changes_json=?,affected_versions_json=?,affected_ranges_json=?,updated_at=? WHERE draft_id=?", p.Revision, string(changes), string(versions), string(ranges), storage.Now(), p.ID)
		return err
	})
	return p, err
}

func CommitPlan(tx *sql.Tx, id string, revision int64, session string) error {
	p, err := readPlan(tx, id)
	if err != nil {
		return err
	}
	if session != "" && p.SessionID != session {
		return errors.New("不能提交其他会话的计划")
	}
	if p.State == "committed" && p.Revision == revision+1 {
		return nil
	}
	if p.State != "draft" || p.Revision != revision {
		return errors.New("计划版本已更改，请重新查看")
	}
	if err = checkPlanSources(tx, p); err != nil {
		return err
	}
	var project, name string
	if err = tx.QueryRow("SELECT COALESCE(s.project_id,''),COALESCE(p.name,'') FROM sessions s LEFT JOIN projects p ON p.project_id=s.project_id WHERE session_id=? AND s.deleted_at IS NULL", p.SessionID).Scan(&project, &name); err != nil {
		return err
	}
	if err = preparePlan(tx, &p, project); err != nil {
		return err
	}
	if len(p.Conflicts) > 0 {
		return errors.New("计划有时间冲突：" + strings.Join(p.Conflicts, "；"))
	}
	data, err := readWork(tx)
	if err != nil {
		return err
	}
	for _, change := range p.Changes {
		task := WorkTask{ID: rand.Text(), Title: strings.TrimSpace(change.Title), Kind: "task", Status: "待办", Priority: "不重要不紧急", ProjectID: project, Project: name}
		if change.ItemID != "" {
			for _, existing := range data.Tasks {
				if existing.ID == change.ItemID {
					task = existing
					break
				}
			}
		}
		task.Date = change.Date
		task.EndDate = change.EndDate
		if change.Timezone != "" {
			task.Timezone = change.Timezone
		}
		if task.Timezone == "" {
			task.Timezone = "UTC"
		}
		if change.Blocks != nil {
			task.Date = ""
			task.EndDate = ""
			task.Blocks = change.Blocks
		}
		task.Revision++
		if err = saveTask(tx, &task, false); err != nil {
			return err
		}
		if change.EstimateMinutes > 0 && change.Blocks == nil {
			if _, err = tx.Exec("UPDATE schedule_blocks SET estimate_source='model',revision=revision+1 WHERE block_id=? AND locked=0 AND COALESCE(estimate_source,'')<>'model'", "schedule-"+task.ID); err != nil {
				return err
			}
		}
	}
	_, err = tx.Exec("UPDATE plan_drafts SET state='committed',revision=revision+1,updated_at=? WHERE draft_id=?", storage.Now(), id)
	return err
}

func (w *Work) CommitPlan(id string, revision int64) error {
	return w.store.Update(context.Background(), func(tx *sql.Tx) error { return CommitPlan(tx, id, revision, "") })
}
func (w *Work) DiscardPlan(id string, revision int64) error {
	return w.store.Update(context.Background(), func(tx *sql.Tx) error {
		result, err := tx.Exec("UPDATE plan_drafts SET state='discarded',revision=revision+1,updated_at=? WHERE draft_id=? AND state='draft' AND revision=?", storage.Now(), id, revision)
		if err != nil {
			return err
		}
		n, _ := result.RowsAffected()
		if n != 1 {
			return errors.New("计划已更改")
		}
		return nil
	})
}
