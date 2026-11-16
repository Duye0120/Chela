package companion

import (
	"database/sql"
	"encoding/json"
	"time"
)

func gateDeliveries(tx *sql.Tx, now time.Time) error {
	rows, err := tx.Query(`SELECT d.delivery_id,d.assistant_id,d.purpose,d.fact_version,COALESCE(i.attention_id,''),COALESCE(i.attention_revision,0),i.state FROM deliveries d JOIN intentions i ON i.intention_id=d.intention_id WHERE d.status IN ('pending','deferred','presented') ORDER BY d.not_before LIMIT 100`)
	if err != nil {
		return err
	}
	type pending struct {
		id, assistant, purpose, fingerprint, attention, intentState string
		revision                                                    int64
	}
	var deliveries []pending
	for rows.Next() {
		var d pending
		if err = rows.Scan(&d.id, &d.assistant, &d.purpose, &d.fingerprint, &d.attention, &d.revision, &d.intentState); err != nil {
			rows.Close()
			return err
		}
		deliveries = append(deliveries, d)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, d := range deliveries {
		state := "pending"
		cfg, err := LoadSettings(tx, d.assistant)
		if err != nil {
			return err
		}
		if Quiet(cfg, now) && !(d.purpose == "reminder" && cfg.ReminderException) {
			state = "deferred"
		}
		if d.attention != "" {
			a, err := scanAttention(tx.QueryRow(attentionSelect+" WHERE attention_id=?", d.attention))
			if err != nil {
				return err
			}
			valid, err := sourceValid(tx, a)
			if err != nil {
				return err
			}
			_, fingerprint, err := factsFor(tx, a)
			if err != nil {
				return err
			}
			var muted int
			if a.ScopeType == "project" {
				if err = tx.QueryRow("SELECT COALESCE((SELECT json_extract(value_json,'$') FROM preferences WHERE assistant_id=? AND scope_type='project' AND scope_id=? AND preference_key='mute_proactive'),0)", a.Assistant, a.ScopeID).Scan(&muted); err != nil {
					return err
				}
			}
			if !cfg.Proactive {
				state = "deferred"
			}
			if muted != 0 {
				state = "revoked"
			}
			if !valid || a.Revision != d.revision || a.State == "cancelled" || a.State == "expired" || fingerprint != d.fingerprint {
				state = "revoked"
			}
		}
		if d.intentState == "revoked" {
			state = "revoked"
		}
		if d.purpose == "execution_result" {
			var valid int
			if err = tx.QueryRow(`SELECT count(*) FROM execution_observations o WHERE 'executor:'||o.terminal_session_id||':'||o.result_ref=? AND o.kind='reply_available' AND NOT EXISTS(SELECT 1 FROM execution_observations seen WHERE seen.terminal_session_id=o.terminal_session_id AND seen.result_ref=o.result_ref AND seen.result_version=o.result_version AND seen.kind='reply_seen') AND NOT EXISTS(SELECT 1 FROM execution_links l JOIN planner_items p ON p.item_id=l.item_id WHERE l.terminal_session_id=o.terminal_session_id AND p.deleted_at IS NOT NULL)`, d.id).Scan(&valid); err != nil {
				return err
			}
			if valid == 0 {
				state = "revoked"
			}
		}
		if d.purpose == "companionship" {
			var session, refs string
			if err = tx.QueryRow("SELECT json_extract(actions_json,'$[0].route.session_id'),source_refs_json FROM deliveries WHERE delivery_id=?", d.id).Scan(&session, &refs); err != nil {
				return err
			}
			valid, e := sourceValid(tx, Attention{Session: session, Sources: json.RawMessage(refs)})
			if e != nil {
				return e
			}
			if !cfg.CompanionChat || !valid {
				state = "revoked"
			} else if cfg.Mode == "focused" {
				state = "deferred"
			}
		}
		if _, err = tx.Exec("UPDATE deliveries SET status=?,revision=revision+1 WHERE delivery_id=? AND status<>? AND (status<>'presented' OR ?='revoked')", state, d.id, state, state); err != nil {
			return err
		}
	}
	_, err = tx.Exec("UPDATE deliveries SET status='expired',revision=revision+1 WHERE status IN ('pending','deferred','presented') AND expires_at<=?", stamp(now))
	return err
}

type Report struct {
	ID       string          `json:"id"`
	Date     string          `json:"date"`
	Timezone string          `json:"timezone"`
	Text     string          `json:"text"`
	Facts    json.RawMessage `json:"facts"`
}

func dailyReport(tx *sql.Tx, now time.Time) error {
	var assistant string
	if err := tx.QueryRow("SELECT assistant_id FROM assistants").Scan(&assistant); err != nil {
		return err
	}
	cfg, err := LoadSettings(tx, assistant)
	if err != nil {
		return err
	}
	if !cfg.DailyReport {
		return nil
	}
	loc, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		return err
	}
	local := now.In(loc)
	date := local.Format(time.DateOnly)
	if local.Format("15:04") < cfg.ReportTime {
		return nil
	}
	var count int
	if err = tx.QueryRow("SELECT count(*) FROM daily_reports WHERE assistant_id=? AND local_date=? AND timezone=?", assistant, date, cfg.Timezone).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	end := start.AddDate(0, 0, 1)
	text, raw, err := reportSnapshot(tx, assistant, now, loc)
	if err != nil {
		return err
	}
	key := assistant + ":daily-report:" + date + ":" + cfg.Timezone
	id := "report-" + key
	intent := "intention-" + key
	delivery := "delivery-" + key
	actions := `[{"action_id":"open","label":"查看今日安排","route":{"type":"calendar"}}]`
	if _, err = tx.Exec(`INSERT INTO intentions(intention_id,assistant_id,kind,state,reason,evidence_refs_json,proposal_json,expires_at,dedupe_key,created_at) VALUES(?,?,'notify','eligible','晨报',?,'{}',?,?,?)`, intent, assistant, string(raw), stamp(end), key, stamp(now)); err != nil {
		return err
	}
	if _, err = tx.Exec(`INSERT INTO deliveries(delivery_id,intention_id,assistant_id,fact_key,fact_version,purpose,dedupe_key,status,surface,text,actions_json,source_refs_json,not_before,expires_at) VALUES(?,?,?,?,'1','daily_report',?,'pending','pet',?,?,?,?,?)`, delivery, intent, assistant, id, key, text, actions, string(raw), stamp(now), stamp(end)); err != nil {
		return err
	}
	_, err = tx.Exec("INSERT INTO daily_reports(report_id,assistant_id,local_date,timezone,fact_snapshot_json,generated_text,delivery_id,updated_at) VALUES(?,?,?,?,?,?,?,?)", id, assistant, date, cfg.Timezone, string(raw), text, delivery, stamp(now))
	return err
}

func Reports(tx *sql.Tx) ([]Report, error) {
	rows, err := tx.Query("SELECT report_id,local_date,timezone,generated_text,fact_snapshot_json FROM daily_reports ORDER BY local_date DESC LIMIT 14")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	reports := []Report{}
	for rows.Next() {
		var r Report
		var raw string
		if err = rows.Scan(&r.ID, &r.Date, &r.Timezone, &r.Text, &raw); err != nil {
			return nil, err
		}
		r.Facts = json.RawMessage(raw)
		reports = append(reports, r)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	var assistant string
	if err = tx.QueryRow("SELECT assistant_id FROM assistants").Scan(&assistant); err != nil {
		return nil, err
	}
	now := time.Now()
	for i := range reports {
		r := &reports[i]
		loc, e := time.LoadLocation(r.Timezone)
		if e != nil {
			return nil, e
		}
		if r.Date != now.In(loc).Format(time.DateOnly) {
			continue
		}
		text, raw, e := reportSnapshot(tx, assistant, now, loc)
		if e != nil {
			return nil, e
		}
		if _, e = tx.Exec("UPDATE daily_reports SET generated_text=?,fact_snapshot_json=?,revision=revision+1,updated_at=? WHERE report_id=?", text, string(raw), stamp(now), r.ID); e != nil {
			return nil, e
		}
		r.Text = text
		r.Facts = json.RawMessage(raw)
	}
	return reports, nil
}
