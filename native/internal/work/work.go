package work

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type WorkTask struct {
	ID           string          `json:"id"`
	Title        string          `json:"title"`
	Description  string          `json:"description"`
	Status       string          `json:"status"`
	Priority     string          `json:"priority"`
	Project      string          `json:"project"`
	Date         string          `json:"date"`
	EndDate      string          `json:"endDate"`
	ParentID     string          `json:"parentId"`
	Revision     int64           `json:"revision"`
	Kind         string          `json:"kind"`
	DueDate      string          `json:"dueDate"`
	DueAt        string          `json:"dueAt"`
	DueLocal     string          `json:"dueLocal"`
	Timezone     string          `json:"timezone"`
	ProjectID    string          `json:"projectId"`
	Blocks       []ScheduleBlock `json:"blocks"`
	ReplyPending bool            `json:"replyPending"`
}

type WorkNote struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Content   string   `json:"content"`
	ParentID  string   `json:"parentId"`
	UpdatedAt string   `json:"updatedAt"`
	Folder    *bool    `json:"folder,omitempty"`
	Favorite  *bool    `json:"favorite,omitempty"`
	Archived  *bool    `json:"archived,omitempty"`
	Inbox     *bool    `json:"inbox,omitempty"`
	Tags      []string `json:"tags,omitzero"`
}

type workData struct {
	Tasks []WorkTask `json:"tasks"`
	Notes []WorkNote `json:"notes"`
}

type Work struct {
	mu    sync.Mutex
	file  string
	store *storage.Store
}

func New(profile string, store *storage.Store) *Work {
	return &Work{file: filepath.Join(profile, "work.json"), store: store}
}

func (w *Work) readLegacy() (workData, error) {
	var data workData
	raw, err := os.ReadFile(w.file)
	if errors.Is(err, os.ErrNotExist) {
		return workData{Tasks: []WorkTask{}, Notes: []WorkNote{}}, nil
	}
	if err != nil {
		return data, err
	}
	if err := json.Unmarshal(raw, &data); err != nil || data.Tasks == nil || data.Notes == nil {
		return workData{}, errors.New("工作区数据格式异常，无法读取")
	}
	return data, nil
}

func (w *Work) Tasks() ([]WorkTask, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	data, err := w.load()
	return data.Tasks, err
}

func (w *Work) Notes() ([]WorkNote, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	data, err := w.load()
	return data.Notes, err
}

func (t WorkTask) treeIDs() (string, string) { return t.ID, t.ParentID }
func (n WorkNote) treeIDs() (string, string) { return n.ID, n.ParentID }

var errWorkMissing = errors.New("记录已不存在")

func workSaveIndex[T interface{ treeIDs() (string, string) }](rows []T, id, parent string) (int, error) {
	index := -1
	parents := make(map[string]string, len(rows))
	for i, row := range rows {
		key, up := row.treeIDs()
		parents[key] = up
		if key == id {
			index = i
		}
	}
	if id != "" && index == -1 {
		return -1, errWorkMissing
	}
	seen := map[string]bool{id: true}
	for parent != "" {
		if seen[parent] {
			return -1, errors.New("上级不能是当前记录或它的子项")
		}
		seen[parent] = true
		up, ok := parents[parent]
		if !ok {
			return -1, errors.New("上级记录已不存在")
		}
		parent = up
	}
	return index, nil
}

func (w *Work) SaveTask(task WorkTask) (WorkTask, error) {
	if strings.TrimSpace(task.Title) == "" {
		return WorkTask{}, errors.New("请填写事项名称")
	}
	for _, date := range []string{task.Date, task.EndDate, task.DueDate} {
		if date != "" {
			if _, err := time.Parse(time.DateOnly, date); err != nil {
				return WorkTask{}, errors.New("日期格式无效，请使用 YYYY-MM-DD")
			}
		}
	}
	if task.EndDate != "" && (task.Date == "" || task.EndDate < task.Date) {
		return WorkTask{}, errors.New("结束日期不能早于开始日期")
	}
	if task.DueDate != "" && (task.DueAt != "" || task.DueLocal != "") {
		return WorkTask{}, errors.New("截止日期和精确截止时间只能选一项")
	}
	if task.DueAt != "" {
		due, err := time.Parse(time.RFC3339, task.DueAt)
		if err != nil {
			return WorkTask{}, errors.New("截止时间无效")
		}
		task.DueAt = due.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	if task.Kind == "" {
		task.Kind = "task"
	}
	if task.Kind != "task" && task.Kind != "calendar_event" {
		return WorkTask{}, errors.New("事项类型无效")
	}
	if task.Timezone == "" {
		task.Timezone = "UTC"
	}
	if _, err := time.LoadLocation(task.Timezone); err != nil {
		return WorkTask{}, errors.New("请选择有效的时区")
	}
	if task.DueLocal != "" {
		location, _ := time.LoadLocation(task.Timezone)
		previous, _ := time.Parse(time.RFC3339, task.DueAt)
		if previous.IsZero() || previous.In(location).Format("2006-01-02T15:04") != task.DueLocal {
			due, err := resolveLocalTime(task.DueLocal, task.Timezone)
			if err != nil {
				return WorkTask{}, err
			}
			task.DueAt = due.UTC().Format("2006-01-02T15:04:05.000Z")
		}
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.initialize(); err != nil {
		return WorkTask{}, err
	}
	err := w.store.Update(context.Background(), func(tx *sql.Tx) error {
		data, err := readWork(tx)
		if err != nil {
			return err
		}
		i, err := workSaveIndex(data.Tasks, task.ID, task.ParentID)
		if err != nil {
			return err
		}
		if i < 0 {
			task.ID = rand.Text()
			task.Revision = 0
		} else if task.Revision != data.Tasks[i].Revision {
			return errors.New("任务已更改，请重新加载后再保存")
		}
		task.Revision++
		return saveTask(tx, &task, false)
	})
	return task, err
}

// The timestamp is also the editor's revision token, even when two saves share a millisecond.
func nextNoteVersion(previous string) string {
	now := time.Now().UTC().Truncate(time.Millisecond)
	if old, err := time.Parse(time.RFC3339Nano, previous); err == nil && !now.After(old) {
		now = old.UTC().Add(time.Millisecond)
	}
	return now.Format("2006-01-02T15:04:05.000Z")
}

func (w *Work) SaveNote(note WorkNote) (WorkNote, error) {
	if strings.TrimSpace(note.Title) == "" {
		return WorkNote{}, errors.New("请填写笔记标题")
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.initialize(); err != nil {
		return WorkNote{}, err
	}
	err := w.store.Update(context.Background(), func(tx *sql.Tx) error {
		data, err := readWork(tx)
		if err != nil {
			return err
		}
		i, err := workSaveIndex(data.Notes, note.ID, note.ParentID)
		if err != nil {
			return err
		}
		if i < 0 {
			note.ID = rand.Text()
		} else if note.UpdatedAt != data.Notes[i].UpdatedAt {
			return errors.New("笔记已更改，请重新加载后再保存")
		}
		note.UpdatedAt = nextNoteVersion(note.UpdatedAt)
		return saveNote(tx, note)
	})
	return note, err
}

func (w *Work) DeleteTask(id string) error {
	return w.remove(id, "task")
}

func (w *Work) DeleteNote(id string) error {
	return w.remove(id, "note")
}
