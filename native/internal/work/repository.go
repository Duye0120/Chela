package work

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func (w *Work) initialize() error {
	db, err := w.store.DB()
	if err != nil {
		return err
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM import_receipts WHERE source='work-json-v1'").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return w.importElectron()
	}
	data, err := w.readLegacy()
	if err != nil {
		return err
	}
	raw, _ := json.Marshal(data)
	err = w.store.Update(context.Background(), func(tx *sql.Tx) error {
		if err = tx.QueryRow("SELECT count(*) FROM import_receipts WHERE source='work-json-v1'").Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return nil
		}
		seen := map[string]bool{}
		for _, task := range data.Tasks {
			if task.ID == "" || seen[task.ID] {
				return errors.New("旧任务存在空白或重复 ID，已停止导入")
			}
			seen[task.ID] = true
			task.Revision = 1
			if task.Kind == "" {
				task.Kind = "task"
			}
			if task.Timezone == "" {
				task.Timezone = "UTC"
			}
			if err = saveTask(tx, &task, true); err != nil {
				return err
			}
			if err = importMap(tx, task.ID, task, "task"); err != nil {
				return err
			}
		}
		for _, note := range data.Notes {
			if note.ID == "" || seen[note.ID] {
				return errors.New("旧笔记存在空白或重复 ID，已停止导入")
			}
			seen[note.ID] = true
			if note.UpdatedAt == "" {
				note.UpdatedAt = storage.Now()
			}
			if err = saveNote(tx, note); err != nil {
				return err
			}
			if err = importMap(tx, note.ID, note, "note"); err != nil {
				return err
			}
		}
		_, err = tx.Exec("INSERT INTO import_receipts VALUES('work-json-v1',?,?,?)", storage.Hash(raw), len(data.Tasks)+len(data.Notes), storage.Now())
		return err
	})
	if err != nil {
		return err
	}
	return w.importElectron()
}
func importMap(tx *sql.Tx, id string, value any, kind string) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = tx.Exec("INSERT INTO legacy_import_map VALUES('work-json-v1',?,?,?, ?,?)", id, storage.Hash(raw), kind, id, storage.Now())
	return err
}
func (w *Work) load() (workData, error) {
	if err := w.initialize(); err != nil {
		return workData{}, err
	}
	db, err := w.store.DB()
	if err != nil {
		return workData{}, err
	}
	tx, err := db.Begin()
	if err != nil {
		return workData{}, err
	}
	defer tx.Rollback()
	return readWork(tx)
}

func readWork(tx *sql.Tx) (workData, error) {
	data := workData{Tasks: []WorkTask{}, Notes: []WorkNote{}}
	rows, err := tx.Query(`SELECT i.item_id,i.kind,i.status,i.title,i.description,i.revision,COALESCE(i.due_date,''),COALESCE(i.due_at,''),COALESCE(i.timezone,'UTC'),COALESCE(i.project_id,''),COALESCE(p.name,''),i.metadata_json,i.updated_at FROM planner_items i LEFT JOIN projects p ON p.project_id=i.project_id WHERE i.deleted_at IS NULL ORDER BY i.created_at,i.item_id`)
	if err != nil {
		return data, err
	}
	for rows.Next() {
		var id, kind, status, title, description, dueDate, dueAt, timezone, projectID, project, meta, updated string
		var revision int64
		if err = rows.Scan(&id, &kind, &status, &title, &description, &revision, &dueDate, &dueAt, &timezone, &projectID, &project, &meta, &updated); err != nil {
			rows.Close()
			return data, err
		}
		if kind == "note" {
			var note WorkNote
			if err = json.Unmarshal([]byte(meta), &note); err != nil {
				rows.Close()
				return data, err
			}
			note.ID = id
			note.Title = title
			note.Content = description
			note.UpdatedAt = updated
			archived := status == "archived"
			note.Archived = &archived
			data.Notes = append(data.Notes, note)
		} else {
			var task WorkTask
			if err = json.Unmarshal([]byte(meta), &task); err != nil {
				rows.Close()
				return data, err
			}
			task.ID = id
			task.Kind = kind
			task.Title = title
			task.Description = description
			task.Revision = revision
			task.DueDate = dueDate
			task.DueAt = dueAt
			task.Timezone = timezone
			if dueAt != "" {
				instant, e := time.Parse(time.RFC3339, dueAt)
				if e != nil {
					rows.Close()
					return data, e
				}
				location, e := time.LoadLocation(timezone)
				if e != nil {
					rows.Close()
					return data, e
				}
				task.DueLocal = instant.In(location).Format("2006-01-02T15:04")
			}
			task.Project = project
			task.ProjectID = projectID
			switch status {
			case "done":
				task.Status = "已完成"
			case "todo":
				task.Status = "待办"
			case "scheduled":
				task.Status = "已安排"
			case "cancelled":
				if task.Status != "已归档" {
					task.Status = "已取消"
				}
			case "doing":
				if task.Status != "待查看" && task.Status != "等我确认" && task.Status != "等我处理" {
					task.Status = "进行中"
				}
			}
			data.Tasks = append(data.Tasks, task)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return data, err
	}
	for index := range data.Tasks {
		task := &data.Tasks[index]
		if e := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM execution_links l JOIN execution_observations o ON o.terminal_session_id=l.terminal_session_id WHERE l.item_id=? AND o.kind='reply_available' AND NOT EXISTS(SELECT 1 FROM execution_observations seen WHERE seen.terminal_session_id=o.terminal_session_id AND seen.result_ref=o.result_ref AND seen.result_version=o.result_version AND seen.kind='reply_seen'))`, task.ID).Scan(&task.ReplyPending); e != nil {
			return data, e
		}
		blocks, e := readBlocks(tx, task.ID)
		if e != nil {
			return data, e
		}
		task.Blocks = []ScheduleBlock{}
		for _, b := range blocks {
			if b.ID != "schedule-"+task.ID {
				task.Blocks = append(task.Blocks, b)
			}
		}
		var start, end string
		err = tx.QueryRow("SELECT COALESCE(local_start,''),COALESCE(local_end,'') FROM schedule_blocks WHERE block_id=?", "schedule-"+task.ID).Scan(&start, &end)
		if err == nil {
			task.Date = start
			if end != "" {
				day, e := time.Parse(time.DateOnly, end)
				if e != nil {
					return data, e
				}
				last := day.AddDate(0, 0, -1).Format(time.DateOnly)
				if last != start {
					task.EndDate = last
				}
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return data, err
		}
	}
	return data, nil
}

func saveTask(tx *sql.Tx, task *WorkTask, legacy bool) error {
	var assistant string
	if err := tx.QueryRow("SELECT assistant_id FROM assistants").Scan(&assistant); err != nil {
		return err
	}
	if len(task.Title) > 2000 || len(task.Description) > 2*1024*1024 {
		return errors.New("任务内容过长")
	}
	status := "todo"
	switch task.Status {
	case "", "待办", "已安排":
	case "进行中", "待查看", "等我确认", "等我处理":
		status = "doing"
	case "已完成":
		status = "done"
	case "已归档", "已取消":
		status = "cancelled"
	default:
		if !legacy {
			return errors.New("任务状态无效")
		}
	}
	if task.Kind == "calendar_event" {
		if task.Status == "已完成" {
			return errors.New("日历事件不支持任务完成状态")
		}
		status = "scheduled"
		if task.Status == "已归档" || task.Status == "已取消" {
			status = "cancelled"
		}
	}
	if task.ProjectID != "" {
		var name string
		if err := tx.QueryRow("SELECT name FROM projects WHERE project_id=? AND assistant_id=?", task.ProjectID, assistant).Scan(&name); err != nil {
			return err
		}
		if name != task.Project {
			task.ProjectID = ""
		}
	}
	if task.Project != "" && task.ProjectID == "" {
		task.ProjectID = "project-name-" + storage.Hash([]byte(strings.TrimSpace(task.Project)))
		if _, err := tx.Exec("INSERT INTO projects(project_id,assistant_id,name) VALUES(?,?,?) ON CONFLICT DO NOTHING", task.ProjectID, assistant, task.Project); err != nil {
			return err
		}
	}
	if task.Project == "" {
		task.ProjectID = ""
	}
	now := storage.Now()
	var completed any
	if status == "done" {
		var previous sql.NullString
		err := tx.QueryRow("SELECT completed_at FROM planner_items WHERE item_id=? AND status='done'", task.ID).Scan(&previous)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if previous.Valid {
			completed = previous.String
		} else if !legacy {
			completed = now
		}
	}
	meta, _ := json.Marshal(map[string]any{"priority": task.Priority, "parentId": task.ParentID, "status": task.Status, "legacy_dates_ambiguous": legacy && task.EndDate != ""})
	_, err := tx.Exec(`INSERT INTO planner_items(item_id,assistant_id,project_id,kind,status,title,description,revision,due_date,due_at,timezone,completed_at,completion_source_json,metadata_json,created_at,updated_at) VALUES(?,?,NULLIF(?,''),?,?,?,?,?,NULLIF(?,''),NULLIF(?,''),?,?,?, ?,?,?) ON CONFLICT(item_id) DO UPDATE SET project_id=excluded.project_id,kind=excluded.kind,status=excluded.status,title=excluded.title,description=excluded.description,revision=excluded.revision,due_date=excluded.due_date,due_at=excluded.due_at,timezone=excluded.timezone,completed_at=excluded.completed_at,completion_source_json=excluded.completion_source_json,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`, task.ID, assistant, task.ProjectID, task.Kind, status, task.Title, task.Description, task.Revision, task.DueDate, task.DueAt, task.Timezone, completed, `{"actor":"user"}`, string(meta), now, now)
	if err != nil {
		return err
	}
	blocks, err := taskBlocks(tx, *task)
	if err != nil {
		return err
	}
	blocks, err = writeBlocks(tx, task.ID, blocks, false)
	if err != nil {
		return err
	}
	task.Blocks = []ScheduleBlock{}
	for _, b := range blocks {
		if b.ID != "schedule-"+task.ID {
			task.Blocks = append(task.Blocks, b)
		}
	}
	if status == "done" || status == "cancelled" {
		if _, err = tx.Exec("UPDATE reminder_rules SET enabled=0,revision=revision+1 WHERE item_id=? AND enabled=1", task.ID); err != nil {
			return err
		}
	}
	event := "planner.changed"
	if legacy {
		event = "planner.imported"
	}
	_, err = storage.AppendEvent(tx, assistant, event, "planner_item", task.ID, task.Revision, "assistant", assistant, task.ID, map[string]string{"item_id": task.ID, "kind": task.Kind, "status": status})
	return err
}

func saveNote(tx *sql.Tx, note WorkNote) error {
	var assistant string
	if err := tx.QueryRow("SELECT assistant_id FROM assistants").Scan(&assistant); err != nil {
		return err
	}
	if len(note.Title) > 2000 || len(note.Content) > 2*1024*1024 {
		return errors.New("笔记内容过长")
	}
	status := "active"
	if note.Archived != nil && *note.Archived {
		status = "archived"
	}
	meta, _ := json.Marshal(map[string]any{"parentId": note.ParentID, "folder": note.Folder, "favorite": note.Favorite, "inbox": note.Inbox, "tags": note.Tags})
	_, err := tx.Exec(`INSERT INTO planner_items(item_id,assistant_id,kind,status,title,description,metadata_json,created_at,updated_at) VALUES(?,?,'note',?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET status=excluded.status,title=excluded.title,description=excluded.description,metadata_json=excluded.metadata_json,revision=planner_items.revision+1,updated_at=excluded.updated_at`, note.ID, assistant, status, note.Title, note.Content, string(meta), note.UpdatedAt, note.UpdatedAt)
	if err != nil {
		return err
	}
	var revision int64
	if err = tx.QueryRow("SELECT revision FROM planner_items WHERE item_id=?", note.ID).Scan(&revision); err != nil {
		return err
	}
	_, err = storage.AppendEvent(tx, assistant, "planner.changed", "planner_item", note.ID, revision, "assistant", assistant, note.ID, map[string]string{"item_id": note.ID, "kind": "note", "status": status})
	return err
}

func (w *Work) remove(id, kind string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.initialize(); err != nil {
		return err
	}
	return w.store.Update(context.Background(), func(tx *sql.Tx) error {
		var assistant, actual string
		var revision int64
		if err := tx.QueryRow("SELECT assistant_id,kind,revision FROM planner_items WHERE item_id=? AND deleted_at IS NULL", id).Scan(&assistant, &actual, &revision); err != nil {
			return err
		}
		if actual != kind && !(kind == "task" && actual == "calendar_event") {
			return errWorkMissing
		}
		now := storage.Now()
		if _, err := tx.Exec("UPDATE planner_items SET title='[已删除]',description='',metadata_json='{}',deleted_at=?,updated_at=?,revision=revision+1 WHERE item_id=?", now, now, id); err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM schedule_blocks WHERE item_id=?", id); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE reminder_rules SET enabled=0,revision=revision+1 WHERE item_id=?", id); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE planner_items SET metadata_json=json_set(metadata_json,'$.parentId',''),revision=revision+1,updated_at=? WHERE json_extract(metadata_json,'$.parentId')=? AND deleted_at IS NULL", now, id); err != nil {
			return err
		}
		_, err := storage.AppendEvent(tx, assistant, "planner.deleted", "planner_item", id, revision+1, "assistant", assistant, id, map[string]string{"item_id": id})
		return err
	})
}
