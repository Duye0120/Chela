package chat

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/companion"
	"github.com/Duye0120/Chela/native/internal/storage"
)

func (c *Chat) Companion() (map[string]any, error) {
	assistant, err := c.store.Identity()
	if err != nil {
		return nil, err
	}
	result := map[string]any{}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		cfg, e := companion.LoadSettings(tx, assistant)
		if e != nil {
			return e
		}
		result["settings"] = cfg
		var profile string
		var personaVersion int64
		if e = tx.QueryRow("SELECT a.persona_version,p.profile_json FROM assistants a JOIN persona_versions p ON p.assistant_id=a.assistant_id AND p.revision=a.persona_version WHERE a.assistant_id=?", assistant).Scan(&personaVersion, &profile); e != nil {
			return e
		}
		result["persona"] = json.RawMessage(profile)
		result["personaVersion"] = personaVersion
		affect, e := companion.LoadAffect(tx, assistant, time.Now())
		if e != nil {
			return e
		}
		result["affect"] = affect
		result["expression"] = companion.ExpressionFor(affect, cfg.Mode)
		items, e := companion.Attentions(tx)
		if e != nil {
			return e
		}
		result["attentions"] = items
		reports, e := companion.Reports(tx)
		if e != nil {
			return e
		}
		result["reports"] = reports
		projects, e := tx.Query("SELECT p.project_id,p.name,COALESCE(p.workspace_path,''),COALESCE(json_extract(v.value_json,'$'),0) FROM projects p LEFT JOIN preferences v ON v.assistant_id=p.assistant_id AND v.scope_type='project' AND v.scope_id=p.project_id AND v.preference_key='mute_proactive' WHERE p.archived_at IS NULL ORDER BY p.name")
		if e != nil {
			return e
		}
		options := []map[string]any{}
		for projects.Next() {
			var id, name, path string
			var muted bool
			if e = projects.Scan(&id, &name, &path, &muted); e != nil {
				projects.Close()
				return e
			}
			options = append(options, map[string]any{"id": id, "name": name, "hasWorkspace": path != "", "muted": muted})
		}
		e = projects.Err()
		projects.Close()
		if e != nil {
			return e
		}
		result["projects"] = options
		rows, e := tx.Query("SELECT accepted_seq,proposal_json,applied_delta_json,disposition,accepted_at FROM affect_events ORDER BY accepted_seq DESC LIMIT 20")
		if e != nil {
			return e
		}
		defer rows.Close()
		audit := []map[string]any{}
		for rows.Next() {
			var seq int64
			var proposal, delta, state, at string
			if e = rows.Scan(&seq, &proposal, &delta, &state, &at); e != nil {
				return e
			}
			audit = append(audit, map[string]any{"seq": seq, "proposal": json.RawMessage(proposal), "delta": json.RawMessage(delta), "state": state, "at": at})
		}
		result["audit"] = audit
		return rows.Err()
	})
	return result, err
}

func (c *Chat) SetProjectQuiet(raw string) error {
	var p struct {
		ID    string `json:"id"`
		Muted bool   `json:"muted"`
	}
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return err
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return err
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error { return companion.SetProjectMuted(tx, assistant, p.ID, p.Muted) })
	if err == nil {
		c.wakeRuns()
	}
	return err
}

func (c *Chat) SavePersona(raw string) error {
	var p struct {
		Version    int64   `json:"version"`
		Prompt     string  `json:"system_prompt"`
		Reactivity float64 `json:"reactivity"`
		Recovery   float64 `json:"recoveryScale"`
	}
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return err
	}
	if strings.TrimSpace(p.Prompt) == "" || len(p.Prompt) > 8000 || p.Reactivity < .5 || p.Reactivity > 1.5 || p.Recovery < .5 || p.Recovery > 2 {
		return errors.New("人格说明或情绪参数无效")
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return err
	}
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		var current int64
		var profile string
		if err := tx.QueryRow("SELECT a.persona_version,p.profile_json FROM assistants a JOIN persona_versions p ON p.assistant_id=a.assistant_id AND p.revision=a.persona_version WHERE a.assistant_id=?", assistant).Scan(&current, &profile); err != nil {
			return err
		}
		if p.Version != current {
			return errors.New("人格已变化，请重新加载")
		}
		var data map[string]any
		if err := json.Unmarshal([]byte(profile), &data); err != nil {
			return err
		}
		data["system_prompt"] = p.Prompt
		data["reactivity"] = p.Reactivity
		data["recoveryScale"] = p.Recovery
		data["name"] = "Chela"
		encoded, _ := json.Marshal(data)
		if _, err := tx.Exec("INSERT INTO persona_versions(assistant_id,revision,profile_json,created_at) VALUES(?,?,?,?)", assistant, current+1, string(encoded), storage.Now()); err != nil {
			return err
		}
		_, err := tx.Exec("UPDATE assistants SET persona_version=? WHERE assistant_id=?", current+1, assistant)
		return err
	})
}

func (c *Chat) SaveCompanionSettings(raw string) (companion.Settings, error) {
	var cfg companion.Settings
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return cfg, err
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return cfg, err
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error { var e error; cfg, e = companion.SaveSettings(tx, assistant, cfg); return e })
	if err == nil {
		c.wakeRuns()
	}
	return cfg, err
}

func (c *Chat) SaveAttention(raw string) (companion.Attention, error) {
	var a companion.Attention
	if err := json.Unmarshal([]byte(raw), &a); err != nil {
		return a, err
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return a, err
	}
	err = c.store.Update(context.Background(), func(tx *sql.Tx) error {
		var e error
		a, e = companion.SaveAttention(tx, a, assistant, "", "", true)
		return e
	})
	if err == nil {
		c.wakeRuns()
	}
	return a, err
}

func (c *Chat) ChangeAttention(raw string) error {
	var p struct {
		ID       string `json:"id"`
		Revision int64  `json:"revision"`
		State    string `json:"state"`
	}
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return err
	}
	err := c.store.Update(context.Background(), func(tx *sql.Tx) error { return companion.ChangeAttention(tx, p.ID, p.Revision, p.State) })
	if err == nil {
		c.wakeRuns()
	}
	return err
}

// Semantic reviews use the same background lane and Pi bridge as foreground chat.
func (c *Chat) queueAttention() error {
	db, err := c.store.DB()
	if err != nil {
		return err
	}
	var busy, due int
	if err = db.QueryRow("SELECT count(*) FROM runs WHERE state NOT IN ('succeeded','failed','cancelled','interrupted')").Scan(&busy); err != nil {
		return err
	}
	if busy > 0 {
		return nil
	}
	if err = db.QueryRow("SELECT count(*) FROM attention_items WHERE state IN ('active','waiting') AND json_extract(condition_json,'$.kind')='semantic_review' AND next_review_at<=?", storage.Now()).Scan(&due); err != nil {
		return err
	}
	if due == 0 {
		return nil
	}
	_, configs, modelID, _, err := c.catalog()
	if err != nil {
		return err
	}
	roles, err := c.ModelRoles()
	if err != nil {
		return err
	}
	if roles["proactivity"] != "" {
		modelID = roles["proactivity"]
	}
	if _, ok := configs[modelID]; !ok {
		return nil
	}
	return c.store.Update(c.lifetime, func(tx *sql.Tx) error {
		now := time.Now()
		var hour, day int
		if err := tx.QueryRow("SELECT count(*) FROM model_requests m JOIN run_attempts a ON a.attempt_id=m.attempt_id JOIN runs r ON r.run_id=a.run_id WHERE r.origin='proactive' AND m.started_at>?", now.UTC().Add(-time.Hour).Format("2006-01-02T15:04:05.000Z")).Scan(&hour); err != nil {
			return err
		}
		if err := tx.QueryRow("SELECT count(*) FROM model_requests m JOIN run_attempts a ON a.attempt_id=m.attempt_id JOIN runs r ON r.run_id=a.run_id WHERE r.origin='proactive' AND m.started_at>?", now.UTC().Add(-24*time.Hour).Format("2006-01-02T15:04:05.000Z")).Scan(&day); err != nil {
			return err
		}
		if hour >= 4 || day >= 12 {
			return nil
		}
		a, facts, fingerprint, prompt, err := companion.NextReview(tx, now)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if prompt == "" {
			return nil
		}
		session := "attention-" + a.ID
		branch, runID, messageID := rand.Text(), rand.Text(), rand.Text()
		at := storage.Now()
		if _, err = tx.Exec("INSERT INTO sessions(session_id,assistant_id,kind,title,created_at,updated_at) VALUES(?,?,'internal','关注审视',?,?) ON CONFLICT DO NOTHING", session, a.Assistant, at, at); err != nil {
			return err
		}
		if _, err = tx.Exec("INSERT INTO branches(branch_id,session_id,created_at) VALUES(?,?,?)", branch, session, at); err != nil {
			return err
		}
		var epoch int64
		if err = tx.QueryRow("SELECT erase_epoch FROM assistants WHERE assistant_id=?", a.Assistant).Scan(&epoch); err != nil {
			return err
		}
		scope, _ := json.Marshal(map[string]any{"scope_id": rand.Text(), "visible_scopes": []any{map[string]string{"type": a.ScopeType, "id": a.ScopeID}}, "erase_epoch": epoch, "output_targets": []string{}})
		if _, err = tx.Exec(`INSERT INTO runs(run_id,assistant_id,session_id,branch_id,origin,origin_session_id,lane,state,phase,scope_json,budget_json,created_at,updated_at) VALUES(?,?,?,?,'proactive',NULLIF(?,''),'background','queued','idle',?,'{"max_model_requests":1,"max_input_tokens":4000,"max_output_tokens":512,"max_tool_calls":0}',?,?)`, runID, a.Assistant, session, branch, a.Session, string(scope), at, at); err != nil {
			return err
		}
		message, _ := json.Marshal(ChatMessage{ID: messageID, Role: "user", Content: prompt, CreatedAt: at})
		if _, err = tx.Exec("INSERT INTO messages(message_id,session_id,branch_id,run_id,role,content_json,created_at) VALUES(?,?,?,?,'user',?,?)", messageID, session, branch, runID, string(message), at); err != nil {
			return err
		}
		if _, err = tx.Exec("INSERT INTO run_inputs(input_id,run_id,message_id,mode,state,created_at) VALUES(?,?,?,'initial','queued',?)", rand.Text(), runID, messageID, at); err != nil {
			return err
		}
		if _, err = tx.Exec("INSERT INTO run_parameters(run_id,model_id,effort,workspace_path,operation) VALUES(?,?,'off','','prompt')", runID, modelID); err != nil {
			return err
		}
		refs, _ := json.Marshal(facts)
		_, err = tx.Exec("INSERT INTO attention_reviews VALUES(?,?,?,?,?,?)", runID, a.ID, a.Revision, fingerprint, string(refs), at)
		return err
	})
}

func settleAttention(tx *sql.Tx, run Run, state, reason string) (string, string, error) {
	if state != "succeeded" {
		return state, reason, nil
	}
	var raw string
	err := tx.QueryRow("SELECT content_json FROM messages WHERE run_id=? AND role='assistant' ORDER BY rowid DESC LIMIT 1", run.ID).Scan(&raw)
	var message ChatMessage
	if err == nil {
		err = json.Unmarshal([]byte(raw), &message)
	}
	if err == nil {
		if _, err = tx.Exec("SAVEPOINT attention_publish"); err != nil {
			return state, reason, err
		}
		err = companion.CommitReview(tx, run.ID, strings.TrimSpace(message.Content), time.Now())
		if err != nil {
			if _, rollbackErr := tx.Exec("ROLLBACK TO attention_publish"); rollbackErr != nil {
				return state, reason, rollbackErr
			}
		}
		if _, releaseErr := tx.Exec("RELEASE attention_publish"); releaseErr != nil {
			return state, reason, releaseErr
		}
	}
	if err != nil {
		return "failed", err.Error(), nil
	}
	return state, reason, nil
}
