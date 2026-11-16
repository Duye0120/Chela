package companion

import (
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type Scores struct {
	Joy            float64 `json:"joy"`
	Pride          float64 `json:"pride"`
	Playful        float64 `json:"playful_irritation"`
	Concern        float64 `json:"concern"`
	Curiosity      float64 `json:"curiosity"`
	Disappointment float64 `json:"disappointment"`
}

type Affect struct {
	Revision      int64  `json:"revision"`
	ConfigVersion int64  `json:"configVersion"`
	AcceptedSeq   int64  `json:"acceptedSeq"`
	Scores        Scores `json:"scores"`
	CalculatedAt  string `json:"calculatedAt"`
	Reason        string `json:"reason"`
	ClockReversed bool   `json:"clockReversed"`
}

type Appraisal struct {
	Cause          string  `json:"cause_event_id"`
	Label          string  `json:"semantic_label"`
	Intensity      float64 `json:"intensity"`
	Confidence     float64 `json:"confidence"`
	PersonaVersion int64   `json:"persona_snapshot_version"`
	MessageID      string  `json:"message_id,omitempty"`
	Evidence       string  `json:"evidence,omitempty"`
}

var baseline = Scores{Joy: 12, Curiosity: 10}
var deltas = map[string]Scores{
	"praise":           {Joy: 10, Pride: 8},
	"friendly_teasing": {Joy: 3, Pride: 3, Playful: 6},
	"correction":       {Joy: -4, Pride: -3, Disappointment: 6},
	"task_succeeded":   {Joy: 8, Pride: 10, Concern: -4, Disappointment: -5},
	"repeated_failure": {Joy: -6, Pride: -6, Concern: 5, Disappointment: 8},
	"blocker_cleared":  {Joy: 6, Pride: 4, Concern: -6},
}
var reasonLabels = map[string]string{"praise": "刚刚的肯定", "friendly_teasing": "刚刚的轻松互动", "correction": "正在认真吸收纠正", "task_succeeded": "一项任务已完成", "repeated_failure": "正在处理执行困难", "blocker_cleared": "一个阻塞已解除"}

func stamp(t time.Time) string        { return t.UTC().Format("2006-01-02T15:04:05.000Z") }
func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }
func scoreValues(s *Scores) []*float64 {
	return []*float64{&s.Joy, &s.Pride, &s.Playful, &s.Concern, &s.Curiosity, &s.Disappointment}
}

func Decay(s Scores, elapsed time.Duration, speed float64) Scores {
	bases := scoreValues(&baseline)
	half := []float64{1800, 2400, 300, 1200, 1200, 600}
	for i, p := range scoreValues(&s) {
		*p = *bases[i] + (*p-*bases[i])*math.Exp2(-math.Max(0, elapsed.Seconds())/(half[i]*clamp(speed, .5, 2)))
	}
	return s
}

func LoadAffect(tx *sql.Tx, assistant string, now time.Time) (Affect, error) {
	a := Affect{Scores: baseline, CalculatedAt: stamp(now)}
	var profile string
	if err := tx.QueryRow("SELECT a.persona_version,p.profile_json FROM assistants a JOIN persona_versions p ON p.assistant_id=a.assistant_id AND p.revision=a.persona_version WHERE a.assistant_id=?", assistant).Scan(&a.ConfigVersion, &profile); err != nil {
		return a, err
	}
	cfg := struct {
		Recovery float64 `json:"recoveryScale"`
	}{Recovery: 1}
	if err := json.Unmarshal([]byte(profile), &cfg); err != nil {
		return a, err
	}
	var raw string
	err := tx.QueryRow("SELECT revision,scores_json,calculated_at,last_accepted_seq FROM affect_state WHERE assistant_id=?", assistant).Scan(&a.Revision, &raw, &a.CalculatedAt, &a.AcceptedSeq)
	if errors.Is(err, sql.ErrNoRows) {
		return a, nil
	}
	if err != nil {
		return a, err
	}
	if err = json.Unmarshal([]byte(raw), &a.Scores); err != nil {
		return a, err
	}
	before, err := time.Parse(time.RFC3339Nano, a.CalculatedAt)
	if err != nil {
		return a, err
	}
	a.ClockReversed = now.Before(before)
	a.Scores = Decay(a.Scores, now.Sub(before), cfg.Recovery)
	if !a.ClockReversed {
		a.CalculatedAt = stamp(now)
	}
	var label string
	err = tx.QueryRow("SELECT json_extract(proposal_json,'$.semantic_label') FROM affect_events WHERE assistant_id=? AND applied_revision=? AND disposition='applied' ORDER BY accepted_seq DESC LIMIT 1", assistant, a.Revision).Scan(&label)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return a, err
	}
	a.Reason = reasonLabels[label]
	active := false
	for i, v := range scoreValues(&a.Scores) {
		if math.Abs(*v-*scoreValues(&baseline)[i]) > 1 {
			active = true
		}
	}
	if !active {
		a.Reason = ""
	}
	return a, nil
}

// Apply accepts a cause once. A model proposes a label; only this reducer changes scores.
func Apply(tx *sql.Tx, assistant string, p Appraisal, cluster string, now time.Time) (Affect, error) {
	a, err := LoadAffect(tx, assistant, now)
	if err != nil {
		return a, err
	}
	base, ok := deltas[p.Label]
	if !ok || math.IsNaN(p.Intensity) || math.IsNaN(p.Confidence) || p.Intensity < 0 || p.Intensity > 1 || p.Confidence < 0 || p.Confidence > 1 {
		return a, errors.New("情绪评估无效")
	}
	var exists int
	if err = tx.QueryRow("SELECT count(*) FROM affect_events WHERE assistant_id=? AND cause_event_id=? AND appraisal_kind='interaction'", assistant, p.Cause).Scan(&exists); err != nil {
		return a, err
	}
	if exists > 0 {
		return a, nil
	}
	var seq int64
	var occurred, kind, profile string
	if err = tx.QueryRow("SELECT seq,occurred_at,event_type FROM domain_events WHERE event_id=? AND assistant_id=? AND redacted_at IS NULL", p.Cause, assistant).Scan(&seq, &occurred, &kind); err != nil {
		return a, errors.New("情绪来源已失效")
	}
	if kind != "memory.source" && kind != "planner.changed" && kind != "run.failed" && kind != "attention.resolved" {
		return a, errors.New("事件不允许触发情绪")
	}
	if err = tx.QueryRow("SELECT profile_json FROM persona_versions WHERE assistant_id=? AND revision=?", assistant, a.ConfigVersion).Scan(&profile); err != nil {
		return a, err
	}
	cfg := struct {
		Reactivity float64 `json:"reactivity"`
	}{Reactivity: 1}
	if err = json.Unmarshal([]byte(profile), &cfg); err != nil {
		return a, err
	}
	sourceTime, err := time.Parse(time.RFC3339Nano, occurred)
	if err != nil {
		return a, err
	}
	disposition := "applied"
	if now.Sub(sourceTime) > 10*time.Minute {
		disposition = "late"
	}
	if p.Confidence < .65 {
		disposition = "neutral"
	}
	var repeats int
	var last string
	if err = tx.QueryRow("SELECT count(*),COALESCE(max(accepted_at),'') FROM affect_events WHERE assistant_id=? AND cluster_key=? AND disposition='applied' AND accepted_at>?", assistant, cluster, stamp(now.Add(-10*time.Minute))).Scan(&repeats, &last); err != nil {
		return a, err
	}
	recent, _ := time.Parse(time.RFC3339Nano, last)
	if !recent.IsZero() && now.Sub(recent) < 30*time.Second {
		disposition = "cooldown"
	}
	scale := p.Intensity * p.Confidence * clamp(cfg.Reactivity, .5, 1.5) / float64(1+repeats)
	delta := Scores{}
	if disposition == "applied" {
		for i, v := range scoreValues(&delta) {
			*v = clamp(*scoreValues(&base)[i]*scale, -12, 12)
		}
		for i, v := range scoreValues(&a.Scores) {
			*v = clamp(*v+*scoreValues(&delta)[i], 0, 100)
		}
		a.Revision++
		a.Reason = reasonLabels[p.Label]
	}
	data, _ := json.Marshal(p)
	applied, _ := json.Marshal(delta)
	result, err := tx.Exec("INSERT INTO affect_events(assistant_id,cause_event_id,source_event_seq,appraisal_kind,persona_version,proposal_json,applied_delta_json,applied_revision,accepted_at,applied_at,cluster_key,disposition) VALUES(?,?,?,'interaction',?,?,?,?,?,?,?,?)", assistant, p.Cause, seq, p.PersonaVersion, string(data), string(applied), a.Revision, stamp(now), stamp(now), cluster, disposition)
	if err != nil {
		return a, err
	}
	a.AcceptedSeq, err = result.LastInsertId()
	if err != nil {
		return a, err
	}
	scores, _ := json.Marshal(a.Scores)
	if _, err = tx.Exec("INSERT INTO affect_state VALUES(?,?,?,?,?,?) ON CONFLICT(assistant_id) DO UPDATE SET revision=excluded.revision,config_version=excluded.config_version,scores_json=excluded.scores_json,calculated_at=excluded.calculated_at,last_accepted_seq=excluded.last_accepted_seq", assistant, a.Revision, a.ConfigVersion, string(scores), a.CalculatedAt, a.AcceptedSeq); err != nil {
		return a, err
	}
	if disposition == "applied" {
		var eventSeq string
		eventSeq, err = storage.AppendEvent(tx, assistant, "affect.changed", "affect", assistant, a.Revision, "assistant", assistant, p.Cause, map[string]any{"revision": a.Revision, "reason": p.Label, "clock_reversed": a.ClockReversed, "base_delta": base, "scale": scale, "novelty": 1 / float64(1+repeats)})
		if err == nil {
			_, err = tx.Exec("UPDATE domain_events SET causation_id=? WHERE seq=?", p.Cause, eventSeq)
		}
	}
	return a, err
}

type Expression struct {
	PersonaVersion int64  `json:"personaVersion"`
	Affect         Affect `json:"affect"`
	Mode           string `json:"mode"`
	Style          string `json:"style"`
	Emotion        string `json:"emotion"`
	Intensity      string `json:"intensity"`
}

func ExpressionFor(a Affect, mode string) Expression {
	e := Expression{PersonaVersion: a.ConfigVersion, Affect: a, Mode: mode, Style: "先准确完成任务，保留自然称呼和轻微心情，不加入无关玩笑。心情不能降低投入、改变事实、权限或任务状态。", Emotion: "neutral", Intensity: "subtle"}
	if mode == "companion" || mode == "creative" {
		e.Style = "先完成用户要求；可自然表达轻微混合心情，不索要安抚，不用负面情绪惩罚用户。"
		e.Intensity = "gentle"
	}
	if mode == "quiet" {
		e.Style = "简短直接，隐藏玩笑和戏剧化表达。"
	}
	high := 0.0
	tags := []string{"joy", "pride", "playful_irritation", "concern", "curiosity", "disappointment"}
	for i, v := range scoreValues(&a.Scores) {
		if *v-*scoreValues(&baseline)[i] > high+2 {
			high = *v - *scoreValues(&baseline)[i]
			e.Emotion = tags[i]
		}
	}
	if mode == "focused" || mode == "quiet" {
		if e.Emotion == "playful_irritation" || e.Emotion == "disappointment" {
			e.Emotion = "attentive"
		}
	}
	return e
}

func FreezeExpression(tx *sql.Tx, run, assistant string, now time.Time) (Expression, error) {
	var e Expression
	var raw string
	err := tx.QueryRow("SELECT snapshot_json FROM run_expression_snapshots WHERE run_id=?", run).Scan(&raw)
	if err == nil {
		err = json.Unmarshal([]byte(raw), &e)
		return e, err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return e, err
	}
	a, err := LoadAffect(tx, assistant, now)
	if err != nil {
		return e, err
	}
	cfg, err := LoadSettings(tx, assistant)
	if err != nil {
		return e, err
	}
	var sessionMode string
	err = tx.QueryRow("SELECT value_json FROM preferences WHERE assistant_id=? AND scope_type='session' AND scope_id=(SELECT session_id FROM runs WHERE run_id=?) AND preference_key='interaction_mode'", assistant, run).Scan(&sessionMode)
	if err == nil {
		if err = json.Unmarshal([]byte(sessionMode), &cfg.Mode); err != nil {
			return e, err
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return e, err
	}
	e = ExpressionFor(a, cfg.Mode)
	data, _ := json.Marshal(e)
	_, err = tx.Exec("INSERT INTO run_expression_snapshots VALUES(?,?)", run, string(data))
	return e, err
}
