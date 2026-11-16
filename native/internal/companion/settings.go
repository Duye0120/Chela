package companion

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type Settings struct {
	Revision          int64  `json:"revision"`
	Mode              string `json:"mode"`
	ModeLocked        bool   `json:"modeLocked"`
	Timezone          string `json:"timezone"`
	QuietUntil        string `json:"quietUntil"`
	QuietStart        string `json:"quietStart"`
	QuietEnd          string `json:"quietEnd"`
	GameMode          bool   `json:"gameMode"`
	Proactive         bool   `json:"proactive"`
	CompanionChat     bool   `json:"companionChat"`
	ReminderException bool   `json:"reminderException"`
	DailyReport       bool   `json:"dailyReport"`
	ReportTime        string `json:"reportTime"`
	PetHidden         bool   `json:"petHidden"`
	PetMotion         bool   `json:"petMotion"`
}

func LoadSettings(tx *sql.Tx, assistant string) (Settings, error) {
	s := Settings{Mode: "focused", Timezone: "UTC", Proactive: true, ReportTime: "09:00"}
	var raw string
	err := tx.QueryRow("SELECT revision,value_json FROM preferences WHERE assistant_id=? AND scope_type='assistant' AND scope_id=? AND preference_key='companion'", assistant, assistant).Scan(&s.Revision, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	err = json.Unmarshal([]byte(raw), &s)
	return s, err
}

func SaveSettings(tx *sql.Tx, assistant string, s Settings) (Settings, error) {
	if !map[string]bool{"focused": true, "companion": true, "quiet": true, "encouraging": true, "creative": true}[s.Mode] {
		return s, errors.New("互动模式无效")
	}
	if _, err := time.LoadLocation(s.Timezone); err != nil {
		return s, errors.New("时区无效")
	}
	if s.QuietUntil != "" {
		v, err := time.Parse(time.RFC3339, s.QuietUntil)
		if err != nil {
			return s, errors.New("免打扰结束时间无效")
		}
		s.QuietUntil = stamp(v)
	}
	for _, v := range []string{s.QuietStart, s.QuietEnd, s.ReportTime} {
		if v != "" {
			if _, err := time.Parse("15:04", v); err != nil {
				return s, errors.New("时间格式应为 HH:mm")
			}
		}
	}
	if (s.QuietStart == "") != (s.QuietEnd == "") {
		return s, errors.New("请同时填写免打扰开始和结束时间")
	}
	if s.DailyReport && s.ReportTime == "" {
		return s, errors.New("请选择晨报时间")
	}
	old, err := LoadSettings(tx, assistant)
	if err != nil {
		return s, err
	}
	if old.Revision != s.Revision {
		return s, errors.New("设置已改变，请重新加载")
	}
	s.Revision++
	raw, _ := json.Marshal(s)
	_, err = tx.Exec("INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,'assistant',?,'companion',?,?,?) ON CONFLICT DO UPDATE SET revision=excluded.revision,value_json=excluded.value_json,updated_at=excluded.updated_at", assistant, assistant, s.Revision, string(raw), storage.Now())
	if err == nil {
		if !s.CompanionChat {
			if _, err = tx.Exec("UPDATE deliveries SET status='revoked',revision=revision+1 WHERE assistant_id=? AND purpose='companionship' AND status IN ('pending','deferred','presented')", assistant); err != nil {
				return s, err
			}
		}
		_, err = storage.AppendEvent(tx, assistant, "companion.settings", "preferences", assistant, s.Revision, "assistant", assistant, assistant, map[string]any{"revision": s.Revision})
	}
	return s, err
}

func Quiet(s Settings, now time.Time) bool {
	until, _ := time.Parse(time.RFC3339Nano, s.QuietUntil)
	if s.GameMode || s.Mode == "quiet" || now.Before(until) {
		return true
	}
	if s.QuietStart == "" || s.QuietEnd == "" {
		return false
	}
	loc, err := time.LoadLocation(s.Timezone)
	if err != nil {
		return true
	}
	current := now.In(loc).Format("15:04")
	if s.QuietStart == s.QuietEnd {
		return true
	}
	if s.QuietStart < s.QuietEnd {
		return current >= s.QuietStart && current < s.QuietEnd
	}
	return current >= s.QuietStart || current < s.QuietEnd
}

func SetProjectMuted(tx *sql.Tx, assistant, project string, muted bool) error {
	var count int
	if err := tx.QueryRow("SELECT count(*) FROM projects WHERE project_id=? AND assistant_id=?", project, assistant).Scan(&count); err != nil {
		return err
	}
	if count != 1 {
		return errors.New("项目不存在")
	}
	raw, _ := json.Marshal(muted)
	if _, err := tx.Exec("INSERT INTO preferences VALUES(?,'project',?,'mute_proactive',1,?,NULL,?) ON CONFLICT DO UPDATE SET revision=revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at", assistant, project, string(raw), storage.Now()); err != nil {
		return err
	}
	if muted {
		_, err := tx.Exec("UPDATE intentions SET state='revoked' WHERE attention_id IN (SELECT attention_id FROM attention_items WHERE scope_type='project' AND scope_id=?) AND state IN ('proposed','eligible','deferred')", project)
		return err
	}
	return nil
}
