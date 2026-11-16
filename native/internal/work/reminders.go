package work

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type Reminder struct {
	ID       string `json:"id"`
	ItemID   string `json:"itemId"`
	Revision int64  `json:"revision"`
	Kind     string `json:"kind"`
	Local    string `json:"local"`
	Timezone string `json:"timezone"`
	Enabled  bool   `json:"enabled"`
	CatchUp  string `json:"catchUp"`
	Next     string `json:"next"`
}

func scanReminder(row interface{ Scan(...any) error }) (Reminder, error) {
	var r Reminder
	var raw string
	err := row.Scan(&r.ID, &r.ItemID, &r.Revision, &raw, &r.Timezone, &r.Enabled, &r.CatchUp, &r.Next)
	if err != nil {
		return r, err
	}
	var rule struct {
		Kind  string `json:"kind"`
		Local string `json:"local"`
	}
	err = json.Unmarshal([]byte(raw), &rule)
	r.Kind = rule.Kind
	r.Local = rule.Local
	return r, err
}

const reminderSelect = `SELECT rule_id,COALESCE(item_id,''),revision,rule_json,timezone,enabled,catch_up,COALESCE(next_fire_at,'') FROM reminder_rules`

func (w *Work) Reminders(item string) ([]Reminder, error) {
	if err := w.initialize(); err != nil {
		return nil, err
	}
	db, err := w.store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(reminderSelect+" WHERE item_id=? ORDER BY rule_id", item)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Reminder{}
	for rows.Next() {
		r, e := scanReminder(rows)
		if e != nil {
			return nil, e
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

func (w *Work) SaveReminder(r Reminder) (Reminder, error) {
	if len(r.ID) > 100 || len(r.ItemID) > 200 || r.ID == "" || r.ItemID == "" {
		return r, errors.New("提醒缺少事项或标识")
	}
	if r.Kind != "once" && r.Kind != "daily" && r.Kind != "weekly" {
		return r, errors.New("提醒重复规则无效")
	}
	if r.CatchUp == "" {
		r.CatchUp = "within_grace"
	}
	if r.CatchUp != "within_grace" && r.CatchUp != "current_day_once" && r.CatchUp != "skip" {
		return r, errors.New("提醒补发规则无效")
	}
	if err := w.initialize(); err != nil {
		return r, err
	}
	next, err := reminderNext(r, time.Now().Add(-time.Minute))
	if err != nil {
		return r, err
	}
	if r.Enabled && next.IsZero() {
		return r, errors.New("提醒时间已过去，请选择未来的时间")
	}
	r.Next = ""
	if !next.IsZero() {
		r.Next = utc(next)
	}
	err = w.store.Update(context.Background(), func(tx *sql.Tx) error {
		var assistant, kind, status string
		if err := tx.QueryRow("SELECT assistant_id,kind,status FROM planner_items WHERE item_id=? AND deleted_at IS NULL", r.ItemID).Scan(&assistant, &kind, &status); err != nil {
			return errors.New("提醒对应事项已不存在")
		}
		if kind == "note" || status == "done" || status == "cancelled" {
			return errors.New("已完成或已取消的事项不能新增提醒")
		}
		var revision int64
		var item string
		err := tx.QueryRow("SELECT revision,item_id FROM reminder_rules WHERE rule_id=?", r.ID).Scan(&revision, &item)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if revision != r.Revision || (item != "" && item != r.ItemID) {
			return errors.New("提醒已更改，请刷新后保存")
		}
		r.Revision++
		raw, _ := json.Marshal(map[string]any{"kind": r.Kind, "local": r.Local, "dst_fold": "earlier", "dst_gap": "next_valid"})
		_, err = tx.Exec(`INSERT INTO reminder_rules(rule_id,assistant_id,item_id,revision,rule_json,timezone,time_binding,enabled,next_fire_at,catch_up,grace_seconds) VALUES(?,?,?,?,?,?,'zoned_local',?,NULLIF(?,''),?,900) ON CONFLICT(rule_id) DO UPDATE SET revision=excluded.revision,rule_json=excluded.rule_json,timezone=excluded.timezone,enabled=excluded.enabled,next_fire_at=excluded.next_fire_at,catch_up=excluded.catch_up`, r.ID, assistant, r.ItemID, r.Revision, string(raw), r.Timezone, r.Enabled, r.Next, r.CatchUp)
		if err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE schedule_occurrences SET state='skipped' WHERE rule_id=? AND state IN ('pending','claimed')", r.ID)
		if err != nil {
			return err
		}
		_, err = storage.AppendEvent(tx, assistant, "reminder.changed", "reminder", r.ID, r.Revision, "assistant", assistant, r.ID, map[string]any{"item_id": r.ItemID, "enabled": r.Enabled})
		return err
	})
	return r, err
}

func utc(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// Reminder policy differs from deadlines: folds use the first instant; gaps use the next valid minute.
func reminderWall(value, zone string) (time.Time, error) {
	wall, err := time.Parse("2006-01-02T15:04", value)
	if err != nil {
		return time.Time{}, errors.New("提醒日期时间无效")
	}
	loc, err := time.LoadLocation(zone)
	if err != nil {
		return time.Time{}, errors.New("提醒时区无效")
	}
	offsets := map[int]bool{}
	for _, h := range []int{-48, -24, 0, 24, 48} {
		_, offset := wall.Add(time.Duration(h) * time.Hour).In(loc).Zone()
		offsets[offset] = true
	}
	for minute := 0; minute <= 1440; minute++ {
		candidateWall := wall.Add(time.Duration(minute) * time.Minute)
		var first time.Time
		for offset := range offsets {
			candidate := candidateWall.Add(-time.Duration(offset) * time.Second)
			if candidate.In(loc).Format("2006-01-02T15:04") == candidateWall.Format("2006-01-02T15:04") && (first.IsZero() || candidate.Before(first)) {
				first = candidate
			}
		}
		if !first.IsZero() {
			return first, nil
		}
	}
	return time.Time{}, errors.New("提醒日期在所选时区不可用")
}

func reminderNext(r Reminder, after time.Time) (time.Time, error) {
	initial, err := time.Parse("2006-01-02T15:04", r.Local)
	if err != nil {
		return time.Time{}, errors.New("提醒日期时间无效")
	}
	loc, err := time.LoadLocation(r.Timezone)
	if err != nil {
		return time.Time{}, errors.New("提醒时区无效")
	}
	if r.Kind == "once" {
		next, e := reminderWall(r.Local, r.Timezone)
		if e != nil {
			return next, e
		}
		if !next.After(after) {
			return time.Time{}, nil
		}
		return next, nil
	}
	local := after.In(loc)
	day := time.Date(local.Year(), local.Month(), local.Day(), initial.Hour(), initial.Minute(), 0, 0, time.UTC)
	if day.Before(initial) {
		day = initial
	}
	for i := 0; i < 9; i++ {
		candidate := day.AddDate(0, 0, i)
		if r.Kind == "weekly" && candidate.Weekday() != initial.Weekday() {
			continue
		}
		next, e := reminderWall(candidate.Format("2006-01-02T15:04"), r.Timezone)
		if e != nil {
			return next, e
		}
		if next.After(after) {
			return next, nil
		}
	}
	return time.Time{}, errors.New("无法计算下一次提醒")
}

// Tick commits occurrences and their deliveries together; no model or external side effect is involved.
func Tick(store *storage.Store, now time.Time) error {
	return store.Update(context.Background(), func(tx *sql.Tx) error {
		rows, err := tx.Query(reminderSelect+" WHERE enabled=1 AND next_fire_at<=? ORDER BY next_fire_at LIMIT 100", utc(now))
		if err != nil {
			return err
		}
		var rules []Reminder
		for rows.Next() {
			r, e := scanReminder(rows)
			if e != nil {
				rows.Close()
				return e
			}
			rules = append(rules, r)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, r := range rules {
			scheduled, e := time.Parse(time.RFC3339, r.Next)
			if e != nil {
				return e
			}
			loc, _ := time.LoadLocation(r.Timezone)
			if r.Kind != "once" {
				initial, _ := time.Parse("2006-01-02T15:04", r.Local)
				local := now.In(loc)
				step := 1
				back := 0
				if r.Kind == "weekly" {
					step = 7
					back = (int(local.Weekday()) - int(initial.Weekday()) + 7) % 7
				}
				wall := time.Date(local.Year(), local.Month(), local.Day()-back, initial.Hour(), initial.Minute(), 0, 0, time.UTC)
				latest, err := reminderWall(wall.Format("2006-01-02T15:04"), r.Timezone)
				if err != nil {
					return err
				}
				if latest.After(now) {
					latest, err = reminderWall(wall.AddDate(0, 0, -step).Format("2006-01-02T15:04"), r.Timezone)
					if err != nil {
						return err
					}
				}
				if latest.After(scheduled) {
					scheduled = latest
					r.Next = utc(latest)
				}
			}
			state := "pending"
			if (r.CatchUp == "within_grace" && now.Sub(scheduled) > 15*time.Minute) || (r.CatchUp == "skip" && now.Sub(scheduled) > time.Minute) || (r.CatchUp == "current_day_once" && scheduled.In(loc).Format(time.DateOnly) != now.In(loc).Format(time.DateOnly)) {
				state = "skipped"
			}
			key := fmt.Sprintf("%d:%s", r.Revision, r.Next)
			id := "occurrence-" + storage.Hash([]byte(r.ID+":"+key))
			if _, err = tx.Exec("INSERT INTO schedule_occurrences(occurrence_id,rule_id,rule_revision,recurrence_key,scheduled_at,state) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING", id, r.ID, r.Revision, key, r.Next, state); err != nil {
				return err
			}
			next, e := reminderNext(r, now)
			if e != nil {
				return e
			}
			var nextValue any
			if !next.IsZero() {
				nextValue = utc(next)
			}
			if _, err = tx.Exec("UPDATE reminder_rules SET next_fire_at=? WHERE rule_id=?", nextValue, r.ID); err != nil {
				return err
			}
		}
		rows, err = tx.Query(`SELECT o.occurrence_id,o.rule_id,o.rule_revision,o.snooze_generation,COALESCE(o.snooze_until,o.scheduled_at),r.assistant_id,COALESCE(r.item_id,''),p.title,r.revision,r.enabled,p.status,p.deleted_at,r.catch_up,r.timezone FROM schedule_occurrences o JOIN reminder_rules r ON r.rule_id=o.rule_id LEFT JOIN planner_items p ON p.item_id=r.item_id WHERE o.state='pending' AND COALESCE(o.snooze_until,o.scheduled_at)<=? LIMIT 100`, utc(now))
		if err != nil {
			return err
		}
		type due struct {
			id, rule, scheduled, assistant, item, title, status string
			rev, generation, current                            int64
			enabled                                             bool
			deleted                                             sql.NullString
			catchUp, timezone                                   string
		}
		var occurrences []due
		for rows.Next() {
			var d due
			if err = rows.Scan(&d.id, &d.rule, &d.rev, &d.generation, &d.scheduled, &d.assistant, &d.item, &d.title, &d.current, &d.enabled, &d.status, &d.deleted, &d.catchUp, &d.timezone); err != nil {
				rows.Close()
				return err
			}
			occurrences = append(occurrences, d)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, d := range occurrences {
			state := "fired"
			scheduled, e := time.Parse(time.RFC3339, d.scheduled)
			if e != nil {
				return e
			}
			loc, e := time.LoadLocation(d.timezone)
			if e != nil {
				return e
			}
			missed := (d.catchUp == "within_grace" && now.Sub(scheduled) > 15*time.Minute) || (d.catchUp == "skip" && now.Sub(scheduled) > time.Minute) || (d.catchUp == "current_day_once" && scheduled.In(loc).Format(time.DateOnly) != now.In(loc).Format(time.DateOnly))
			if missed || !d.enabled || d.rev != d.current || d.deleted.Valid || d.status == "done" || d.status == "cancelled" {
				state = "skipped"
			} else {
				expiry := now.Add(24 * time.Hour)
				if err = createDelivery(tx, d.assistant, d.id, fmt.Sprint(d.generation), "reminder", "提醒："+d.title, d.item, now, expiry); err != nil {
					return err
				}
			}
			if _, err = tx.Exec("UPDATE schedule_occurrences SET state=?,fired_at=? WHERE occurrence_id=?", state, utc(now), d.id); err != nil {
				return err
			}
		}
		_, err = tx.Exec(`UPDATE deliveries SET status='revoked',revision=revision+1 WHERE purpose='reminder' AND status IN ('pending','deferred','presented') AND NOT EXISTS(SELECT 1 FROM schedule_occurrences o JOIN reminder_rules r ON r.rule_id=o.rule_id JOIN planner_items p ON p.item_id=r.item_id WHERE o.occurrence_id=deliveries.fact_key AND r.revision=o.rule_revision AND r.enabled=1 AND p.deleted_at IS NULL AND p.status NOT IN ('done','cancelled'))`)
		if err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE deliveries SET status='expired',revision=revision+1 WHERE status IN ('pending','deferred','presented') AND expires_at<=?", utc(now))
		return err
	})
}

func createDelivery(tx *sql.Tx, assistant, fact, version, purpose, text, item string, now, expires time.Time) error {
	key := assistant + ":" + purpose + ":" + fact + ":" + version
	id := "delivery-" + storage.Hash([]byte(key))
	intent := "intention-" + storage.Hash([]byte(key))
	var revision int64
	var title, description string
	if err := tx.QueryRow("SELECT revision,title,description FROM planner_items WHERE item_id=?", item).Scan(&revision, &title, &description); err != nil {
		return err
	}
	refs, _ := json.Marshal([]any{map[string]any{"source_type": "planner_item", "source_id": item, "source_revision": revision, "payload_hash": storage.Hash([]byte(title + "\n" + description)), "scope": map[string]string{"type": "assistant", "id": assistant}}})
	actions, _ := json.Marshal([]any{map[string]any{"action_id": "open", "label": "打开事项", "route": map[string]string{"type": "planner", "item_id": item}}})
	_, err := tx.Exec(`INSERT INTO intentions(intention_id,assistant_id,kind,state,reason,evidence_refs_json,proposal_json,expires_at,dedupe_key,created_at) VALUES(?,?,'notify','acted',?,?,'{}',?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`, intent, assistant, purpose, string(refs), utc(expires), key, utc(now))
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO deliveries(delivery_id,intention_id,assistant_id,fact_key,fact_version,purpose,dedupe_key,status,surface,text,actions_json,source_refs_json,not_before,expires_at) VALUES(?,?,?,?,?,?,?,'pending','workspace',?,?,?,?,?) ON CONFLICT DO NOTHING`, id, intent, assistant, fact, version, purpose, key, text, string(actions), string(refs), utc(now), utc(expires))
	return err
}

type Delivery struct {
	ID      string          `json:"id"`
	Text    string          `json:"text"`
	Status  string          `json:"status"`
	Purpose string          `json:"purpose"`
	Actions json.RawMessage `json:"actions"`
	Created string          `json:"created"`
}

func (w *Work) Notifications() ([]Delivery, error) {
	db, err := w.store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query("SELECT delivery_id,text,status,purpose,actions_json,not_before FROM deliveries WHERE status NOT IN ('revoked','expired') ORDER BY not_before DESC LIMIT 100")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Delivery{}
	for rows.Next() {
		var d Delivery
		var raw string
		if err = rows.Scan(&d.ID, &d.Text, &d.Status, &d.Purpose, &raw, &d.Created); err != nil {
			return nil, err
		}
		d.Actions = json.RawMessage(raw)
		result = append(result, d)
	}
	return result, rows.Err()
}

func (w *Work) RespondNotification(id, action, command string) error {
	if command == "" || len(command) > 200 {
		return errors.New("缺少操作标识")
	}
	if action != "seen" && action != "dismissed" && action != "presented" && action != "snooze" {
		return errors.New("提醒操作无效")
	}
	return w.store.Update(context.Background(), func(tx *sql.Tx) error {
		hash := storage.Hash([]byte(id + ":" + action))
		var oldHash string
		err := tx.QueryRow("SELECT payload_hash FROM command_receipts WHERE command_id=?", command).Scan(&oldHash)
		if err == nil {
			if oldHash != hash {
				return errors.New("操作标识已被使用")
			}
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		var fact, purpose, status string
		if err = tx.QueryRow("SELECT fact_key,purpose,status FROM deliveries WHERE delivery_id=? AND expires_at>?", id, storage.Now()).Scan(&fact, &purpose, &status); err != nil {
			return errors.New("提醒已经过期或不存在")
		}
		if status == "revoked" || status == "expired" {
			return errors.New("提醒已失效")
		}
		if action == "snooze" {
			if purpose != "reminder" {
				return errors.New("此提示不支持稍后提醒")
			}
			result, e := tx.Exec(`UPDATE schedule_occurrences SET state='pending',snooze_until=?,snooze_generation=snooze_generation+1 WHERE occurrence_id=? AND state='fired' AND EXISTS(SELECT 1 FROM reminder_rules r JOIN planner_items p ON p.item_id=r.item_id WHERE r.rule_id=schedule_occurrences.rule_id AND r.revision=schedule_occurrences.rule_revision AND r.enabled=1 AND p.deleted_at IS NULL AND p.status NOT IN ('done','cancelled'))`, utc(time.Now().Add(10*time.Minute)), fact)
			if e != nil {
				return e
			}
			changed, _ := result.RowsAffected()
			if changed != 1 {
				return errors.New("提醒已处理或事项已改变")
			}
			action = "dismissed"
		}
		if action == "presented" && (status == "seen" || status == "dismissed") {
			return nil
		}
		column := map[string]string{"seen": "seen_at", "dismissed": "dismissed_at", "presented": "delivered_at"}[action]
		_, err = tx.Exec("UPDATE deliveries SET status=?,revision=revision+1,"+column+"=? WHERE delivery_id=?", action, storage.Now(), id)
		if err != nil {
			return err
		}
		_, err = tx.Exec("INSERT INTO command_receipts VALUES(?,'user','delivery.respond',?,'{}',0,?)", command, hash, storage.Now())
		return err
	})
}
