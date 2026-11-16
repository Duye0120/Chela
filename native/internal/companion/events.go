package companion

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

// Tick handles durable facts locally. Its own output events are never new appraisal inputs.
func Tick(store *storage.Store, now time.Time) error {
	return store.Update(context.Background(), func(tx *sql.Tx) error {
		if err := consume(tx, now); err != nil {
			return err
		}
		if err := reviewDue(tx, now); err != nil {
			return err
		}
		if err := dailyReport(tx, now); err != nil {
			return err
		}
		if err := companionship(tx, now); err != nil {
			return err
		}
		return gateDeliveries(tx, now)
	})
}

func consume(tx *sql.Tx, now time.Time) error {
	rows, err := tx.Query(`SELECT o.outbox_id,d.event_id,d.assistant_id,d.event_type,d.aggregate_id,d.aggregate_revision,d.scope_type,d.scope_id,d.payload_json FROM outbox o JOIN domain_events d ON d.event_id=o.event_id WHERE o.consumer_id='supervisor' AND o.state='pending' ORDER BY d.seq LIMIT 128`)
	if err != nil {
		return err
	}
	type event struct {
		out, id, assistant, kind, aggregate, scopeType, scope, raw string
		revision                                                   int64
	}
	var events []event
	for rows.Next() {
		var e event
		if err = rows.Scan(&e.out, &e.id, &e.assistant, &e.kind, &e.aggregate, &e.revision, &e.scopeType, &e.scope, &e.raw); err != nil {
			rows.Close()
			return err
		}
		events = append(events, e)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, e := range events {
		label, cluster := "", ""
		switch e.kind {
		case "planner.changed":
			var payload struct {
				Status string `json:"status"`
			}
			if err = json.Unmarshal([]byte(e.raw), &payload); err != nil {
				return err
			}
			var previous string
			if err = tx.QueryRow("SELECT COALESCE((SELECT json_extract(payload_json,'$.status') FROM domain_events WHERE aggregate_id=? AND event_type='planner.changed' AND aggregate_revision<? ORDER BY seq DESC LIMIT 1),'')", e.aggregate, e.revision).Scan(&previous); err != nil {
				return err
			}
			if payload.Status == "done" && previous != "done" {
				label = "task_succeeded"
				cluster = "task:" + e.aggregate
			}
		case "run.failed":
			var failures int
			var reason, origin string
			if err = tx.QueryRow("SELECT COALESCE(terminal_reason,''),origin FROM runs WHERE run_id=?", e.aggregate).Scan(&reason, &origin); err != nil {
				return err
			}
			if origin == "user" || origin == "recovery" {
				if err = tx.QueryRow("SELECT count(*) FROM runs WHERE session_id=? AND state='failed' AND terminal_reason=? AND updated_at>?", e.scope, reason, stamp(now.Add(-10*time.Minute))).Scan(&failures); err != nil {
					return err
				}
				if failures >= 2 {
					label = "repeated_failure"
					cluster = "failure:" + e.scope + ":" + storage.Hash([]byte(reason))
				}
			}
		}
		if label != "" {
			var version int64
			if err = tx.QueryRow("SELECT persona_version FROM assistants WHERE assistant_id=?", e.assistant).Scan(&version); err != nil {
				return err
			}
			if _, err = Apply(tx, e.assistant, Appraisal{Cause: e.id, Label: label, Confidence: 1, Intensity: .7, PersonaVersion: version}, cluster, now); err != nil {
				return err
			}
		}
		if e.kind == "planner.changed" || e.kind == "planner.deleted" || strings.HasPrefix(e.kind, "execution.") {
			if _, err = tx.Exec(`UPDATE attention_items SET next_review_at=? WHERE state IN ('active','waiting') AND (json_extract(condition_json,'$.itemId')=? OR (scope_type=? AND scope_id=?))`, stamp(now), e.aggregate, e.scopeType, e.scope); err != nil {
				return err
			}
		}
		if _, err = tx.Exec("INSERT OR IGNORE INTO consumer_receipts VALUES('supervisor',?,?)", e.id, stamp(now)); err != nil {
			return err
		}
		if _, err = tx.Exec("UPDATE outbox SET state='delivered',attempt_count=attempt_count+1 WHERE outbox_id=?", e.out); err != nil {
			return err
		}
	}
	return nil
}
