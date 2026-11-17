package companion

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

type Presence struct {
	Locked, Fullscreen, Hidden, Busy bool
}

type PresentedDelivery struct {
	ID      string          `json:"id"`
	Text    string          `json:"text"`
	Purpose string          `json:"purpose"`
	Actions json.RawMessage `json:"actions"`
	Report  *ReportFacts    `json:"report,omitempty"`
}

type ReportFacts struct {
	Today     []Fact `json:"today"`
	Completed []Fact `json:"completed"`
	Leftover  []Fact `json:"leftover"`
}

type Presentation struct {
	ID           string              `json:"id"`
	Emotion      string              `json:"emotion"`
	Acknowledged bool                `json:"acknowledged"`
	Items        []PresentedDelivery `json:"items"`
}

// NextPresentation owns the single bubble; clients only render this committed selection.
func NextPresentation(tx *sql.Tx, assistant string, presence Presence, now time.Time) (*Presentation, error) {
	if err := gateDeliveries(tx, now); err != nil {
		return nil, err
	}
	// Reminders can be cancelled between the scheduler tick and a UI poll.
	if _, err := tx.Exec(`UPDATE deliveries SET status='revoked',revision=revision+1 WHERE purpose='reminder' AND status IN ('pending','deferred','presented') AND NOT EXISTS(SELECT 1 FROM schedule_occurrences o JOIN reminder_rules r ON r.rule_id=o.rule_id JOIN planner_items p ON p.item_id=r.item_id WHERE o.occurrence_id=deliveries.fact_key AND r.revision=o.rule_revision AND r.enabled=1 AND p.deleted_at IS NULL AND p.status NOT IN ('done','cancelled'))`); err != nil {
		return nil, err
	}
	cfg, err := LoadSettings(tx, assistant)
	if err != nil {
		return nil, err
	}
	if presence.Locked || presence.Hidden || presence.Busy {
		return nil, nil
	}
	quiet := presence.Fullscreen || Quiet(cfg, now)
	p := &Presentation{Items: []PresentedDelivery{}}
	var acknowledged sql.NullString
	err = tx.QueryRow("SELECT presentation_id,emotion,acknowledged_at FROM presentations WHERE assistant_id=? AND state='active'", assistant).Scan(&p.ID, &p.Emotion, &acknowledged)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if err == nil {
		p.Acknowledged = acknowledged.Valid
		p.Items, err = presentationItems(tx, p.ID, now)
		if err != nil {
			return nil, err
		}
		if len(p.Items) > 0 {
			var priorityReminder int
			if p.Items[0].Purpose != "reminder" && (!quiet || cfg.ReminderException) {
				if err = tx.QueryRow("SELECT count(*) FROM deliveries WHERE assistant_id=? AND purpose='reminder' AND status='pending' AND not_before<=? AND expires_at>?", assistant, stamp(now), stamp(now)).Scan(&priorityReminder); err != nil {
					return nil, err
				}
			}
			if priorityReminder == 0 && quiet && !(cfg.ReminderException && p.Items[0].Purpose == "reminder") {
				return nil, nil
			}
			if priorityReminder == 0 {
				return p, nil
			}
		}
		if _, err = tx.Exec("UPDATE presentations SET state='ended',ended_at=? WHERE presentation_id=?", stamp(now), p.ID); err != nil {
			return nil, err
		}
	}
	// One merged prompt per quiet return, with a gap before any following prompt.
	var recent int
	if err = tx.QueryRow("SELECT count(*) FROM presentations WHERE assistant_id=? AND state='ended' AND ended_at>?", assistant, stamp(now.Add(-time.Minute))).Scan(&recent); err != nil {
		return nil, err
	}
	rows, err := tx.Query(`SELECT delivery_id,purpose FROM deliveries WHERE assistant_id=? AND status='pending' AND (surface='pet' OR purpose='reminder') AND not_before<=? AND expires_at>? ORDER BY CASE purpose WHEN 'reminder' THEN 0 ELSE 1 END,not_before LIMIT 100`, assistant, stamp(now), stamp(now))
	if err != nil {
		return nil, err
	}
	ids := []string{}
	reminders := false
	for rows.Next() {
		var id, purpose string
		if err = rows.Scan(&id, &purpose); err != nil {
			rows.Close()
			return nil, err
		}
		isReminder := purpose == "reminder"
		if quiet && !(cfg.ReminderException && isReminder) {
			continue
		}
		if recent > 0 && !isReminder {
			continue
		}
		if len(ids) == 0 {
			reminders = isReminder
		}
		if reminders != isReminder {
			continue
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}
	p = &Presentation{ID: rand.Text(), Items: []PresentedDelivery{}}
	affect, err := LoadAffect(tx, assistant, now)
	if err != nil {
		return nil, err
	}
	p.Emotion = ExpressionFor(affect, cfg.Mode).Emotion
	if _, err = tx.Exec("INSERT INTO presentations(presentation_id,assistant_id,emotion,state,created_at) VALUES(?,?,?,'active',?)", p.ID, assistant, p.Emotion, stamp(now)); err != nil {
		return nil, err
	}
	for _, id := range ids {
		if _, err = tx.Exec("INSERT INTO presentation_deliveries VALUES(?,?)", p.ID, id); err != nil {
			return nil, err
		}
	}
	p.Items, err = presentationItems(tx, p.ID, now)
	return p, err
}

func presentationItems(tx *sql.Tx, id string, now time.Time) ([]PresentedDelivery, error) {
	rows, err := tx.Query(`SELECT d.delivery_id,d.text,d.purpose,d.actions_json,d.source_refs_json FROM presentation_deliveries p JOIN deliveries d ON d.delivery_id=p.delivery_id WHERE p.presentation_id=? AND d.status IN ('pending','deferred','presented') AND d.expires_at>? ORDER BY d.not_before,d.delivery_id`, id, stamp(now))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []PresentedDelivery{}
	for rows.Next() {
		var d PresentedDelivery
		var raw, facts string
		if err = rows.Scan(&d.ID, &d.Text, &d.Purpose, &raw, &facts); err != nil {
			return nil, err
		}
		d.Actions = json.RawMessage(raw)
		if d.Purpose == "daily_report" {
			d.Report = &ReportFacts{}
			if err = json.Unmarshal([]byte(facts), d.Report); err != nil {
				return nil, err
			}
		}
		items = append(items, d)
	}
	return items, rows.Err()
}

func AcknowledgePresentation(tx *sql.Tx, id string, now time.Time) error {
	var state string
	if err := tx.QueryRow("SELECT state FROM presentations WHERE presentation_id=?", id).Scan(&state); err != nil {
		return err
	}
	if state != "active" {
		return nil
	}
	if _, err := tx.Exec("UPDATE presentations SET acknowledged_at=COALESCE(acknowledged_at,?) WHERE presentation_id=?", stamp(now), id); err != nil {
		return err
	}
	_, err := tx.Exec(`UPDATE deliveries SET status='presented',delivered_at=COALESCE(delivered_at,?),revision=revision+1 WHERE delivery_id IN (SELECT delivery_id FROM presentation_deliveries WHERE presentation_id=?) AND status IN ('pending','deferred') AND expires_at>?`, stamp(now), id, stamp(now))
	return err
}

func DismissPresentation(tx *sql.Tx, id string, now time.Time) error {
	if _, err := tx.Exec(`UPDATE deliveries SET status='dismissed',dismissed_at=?,revision=revision+1 WHERE delivery_id IN (SELECT delivery_id FROM presentation_deliveries WHERE presentation_id=?) AND status IN ('pending','deferred','presented')`, stamp(now), id); err != nil {
		return err
	}
	_, err := tx.Exec("UPDATE presentations SET state='ended',ended_at=COALESCE(ended_at,?) WHERE presentation_id=?", stamp(now), id)
	return err
}
