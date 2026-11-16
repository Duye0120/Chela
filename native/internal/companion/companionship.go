package companion

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// A quiet invitation needs no model call or other session's private transcript.
func companionship(tx *sql.Tx, now time.Time) error {
	var assistant string
	if err := tx.QueryRow("SELECT assistant_id FROM assistants").Scan(&assistant); err != nil {
		return err
	}
	cfg, err := LoadSettings(tx, assistant)
	if err != nil {
		return err
	}
	if !cfg.CompanionChat || cfg.Mode == "focused" || Quiet(cfg, now) || cfg.PetHidden {
		return nil
	}
	var busy int
	if err = tx.QueryRow("SELECT count(*) FROM runs WHERE lane='foreground' AND state NOT IN ('succeeded','failed','cancelled','interrupted')").Scan(&busy); err != nil {
		return err
	}
	if busy > 0 {
		return nil
	}
	var message, session, created string
	var revision int64
	err = tx.QueryRow(`SELECT m.message_id,m.session_id,m.revision,m.created_at FROM messages m JOIN sessions s ON s.session_id=m.session_id WHERE s.assistant_id=? AND s.kind='user' AND s.deleted_at IS NULL AND m.role='user' AND m.erased_at IS NULL ORDER BY m.created_at DESC LIMIT 1`, assistant).Scan(&message, &session, &revision, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	interaction, err := time.Parse(time.RFC3339Nano, created)
	if err != nil {
		return err
	}
	if interaction.After(now.Add(-5*time.Minute)) || interaction.Before(now.Add(-2*time.Hour)) {
		return nil
	}
	refs, _ := json.Marshal([]any{map[string]any{"source_type": "message", "source_id": message, "source_revision": revision}})
	valid, err := sourceValid(tx, Attention{Session: session, Sources: refs})
	if err != nil || !valid {
		return err
	}
	var quota int
	if err = tx.QueryRow("SELECT count(*) FROM deliveries WHERE assistant_id=? AND purpose='companionship' AND not_before>?", assistant, stamp(now.Add(-24*time.Hour))).Scan(&quota); err != nil {
		return err
	}
	if quota > 0 {
		return nil
	}
	if err = tx.QueryRow(`SELECT count(*) FROM presentations p JOIN presentation_deliveries link ON link.presentation_id=p.presentation_id JOIN deliveries d ON d.delivery_id=link.delivery_id WHERE p.assistant_id=? AND p.acknowledged_at>? AND d.purpose<>'reminder'`, assistant, stamp(now.Add(-4*time.Hour))).Scan(&quota); err != nil {
		return err
	}
	if quota > 0 {
		return nil
	}
	if err = tx.QueryRow(`SELECT count(*) FROM deliveries d WHERE d.assistant_id=? AND d.purpose='companionship' AND d.not_before>? AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.session_id=json_extract(d.actions_json,'$[0].route.session_id') AND m.role='user' AND m.erased_at IS NULL AND m.created_at>d.not_before)`, assistant, stamp(now.AddDate(0, 0, -7))).Scan(&quota); err != nil {
		return err
	}
	if quota >= 2 {
		return nil
	}
	loc, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		return err
	}
	key := "companionship:" + assistant + ":" + now.In(loc).Format(time.DateOnly)
	actions, _ := json.Marshal([]any{map[string]any{"action_id": "open", "label": "聊两句", "route": map[string]string{"type": "chat", "session_id": session}}})
	expires := stamp(now.Add(15 * time.Minute))
	if _, err = tx.Exec(`INSERT INTO intentions(intention_id,assistant_id,kind,state,reason,evidence_refs_json,proposal_json,expires_at,dedupe_key,created_at) VALUES(?,?,'notify','eligible','已开启偶尔聊天',?,'{}',?,?,?) ON CONFLICT DO NOTHING`, key, assistant, string(refs), expires, key, stamp(now)); err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO deliveries(delivery_id,intention_id,assistant_id,fact_key,fact_version,purpose,dedupe_key,status,surface,text,actions_json,source_refs_json,not_before,expires_at) VALUES(?,?,?,?,'1','companionship',?,'pending','pet','要不要聊两句？有空再来就好。',?,?,?,?) ON CONFLICT DO NOTHING`, key, key, assistant, message, key, string(actions), string(refs), stamp(now), expires)
	return err
}
