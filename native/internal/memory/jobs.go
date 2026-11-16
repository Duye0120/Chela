package memory

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Duye0120/Chela/native/internal/storage"
)

const Extractor = "chela-memory-v1"

type Source struct {
	Seq       int64  `json:"eligible_seq"`
	EventID   string `json:"event_id"`
	SessionID string `json:"session_id"`
	MessageID string `json:"message_id"`
	Hash      string `json:"hash"`
	Content   string `json:"content"`
}
type Job struct {
	ID             string   `json:"id"`
	AssistantID    string   `json:"assistant_id"`
	Scope          Scope    `json:"scope"`
	From           int64    `json:"from"`
	To             int64    `json:"to"`
	Hash           string   `json:"hash"`
	CursorRevision int64    `json:"cursor_revision"`
	Fence          int64    `json:"fence"`
	EraseEpoch     int64    `json:"erase_epoch"`
	State          string   `json:"state"`
	Error          string   `json:"error,omitempty"`
	Sources        []Source `json:"sources"`
}

func Enqueue(tx *sql.Tx, session, message string) error {
	assistant, scopes, err := Scopes(tx, session)
	if err != nil {
		return err
	}
	text, hash, event, err := source(tx, session, message)
	if err != nil {
		return err
	}
	scope := scopes[1]
	if len(scopes) > 2 {
		scope = scopes[2]
	} else if Explicit(text) {
		scope = scopes[0]
	}
	_, err = tx.Exec(`INSERT OR IGNORE INTO memory_eligible_events(assistant_id,scope_type,scope_id,source_event_id,source_revision,source_hash,eligible_at) VALUES(?,?,?,?,1,?,?)`, assistant, scope.Type, scope.ID, event, hash, storage.Now())
	return err
}

func EnqueueRun(tx *sql.Tx, run string) error {
	rows, err := tx.Query("SELECT m.session_id,m.message_id FROM messages m JOIN run_inputs i ON i.message_id=m.message_id WHERE m.run_id=? AND m.role='user' AND i.state='consumed' AND m.erased_at IS NULL", run)
	if err != nil {
		return err
	}
	pairs := [][2]string{}
	for rows.Next() {
		var p [2]string
		if err = rows.Scan(&p[0], &p[1]); err != nil {
			rows.Close()
			return err
		}
		pairs = append(pairs, p)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, p := range pairs {
		if err = Enqueue(tx, p[0], p[1]); err != nil {
			return err
		}
	}
	return nil
}

func QueueJob(tx *sql.Tx, assistant string, scope Scope) (Job, error) {
	var j Job
	if _, err := tx.Exec(`INSERT INTO consolidation_cursors(assistant_id,scope_type,scope_id,extractor_version) VALUES(?,?,?,?) ON CONFLICT DO NOTHING`, assistant, scope.Type, scope.ID, Extractor); err != nil {
		return j, err
	}
	var cursor, revision int64
	if err := tx.QueryRow("SELECT last_eligible_seq,revision FROM consolidation_cursors WHERE assistant_id=? AND scope_type=? AND scope_id=? AND extractor_version=?", assistant, scope.Type, scope.ID, Extractor).Scan(&cursor, &revision); err != nil {
		return j, err
	}
	var active int
	if err := tx.QueryRow("SELECT count(*) FROM consolidation_jobs WHERE assistant_id=? AND scope_type=? AND scope_id=? AND extractor_version=? AND state IN ('queued','running')", assistant, scope.Type, scope.ID, Extractor).Scan(&active); err != nil {
		return j, err
	}
	if active > 0 {
		return j, errors.New("此范围已有待处理的整理任务")
	}
	rows, err := tx.Query(`SELECT e.eligible_seq,e.source_event_id,d.scope_id,d.aggregate_id,e.source_hash,CASE WHEN m.erased_at IS NOT NULL OR EXISTS(SELECT 1 FROM erasure_rules x WHERE x.assistant_id=e.assistant_id AND x.source_type='event' AND x.source_id=e.source_event_id) THEN '[来源已屏蔽，请返回 no_candidate]' ELSE COALESCE(json_extract(m.content_json,'$.content'),'') END FROM memory_eligible_events e JOIN domain_events d ON d.event_id=e.source_event_id JOIN messages m ON m.message_id=d.aggregate_id WHERE e.assistant_id=? AND e.scope_type=? AND e.scope_id=? AND e.eligible_seq>? ORDER BY e.eligible_seq LIMIT 128`, assistant, scope.Type, scope.ID, cursor)
	if err != nil {
		return j, err
	}
	sources := []Source{}
	size := 0
	for rows.Next() {
		var s Source
		if err = rows.Scan(&s.Seq, &s.EventID, &s.SessionID, &s.MessageID, &s.Hash, &s.Content); err != nil {
			rows.Close()
			return j, err
		}
		if size+len(s.Content) > 12000 && len(sources) > 0 {
			break
		}
		if len(s.Content) > 12000 {
			s.Content = "[来源过长，需用户在记忆界面选择具体内容]"
		}
		size += len(s.Content)
		sources = append(sources, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return j, err
	}
	if len(sources) == 0 {
		return j, sql.ErrNoRows
	}
	input, _ := json.Marshal(sources)
	hash := storage.Hash(input)
	key := fmt.Sprintf("%s:%s:%d:%d:%s:%s", scope.Type, scope.ID, sources[0].Seq, sources[len(sources)-1].Seq, hash, Extractor)
	var epoch int64
	if err = tx.QueryRow("SELECT erase_epoch FROM assistants WHERE assistant_id=?", assistant).Scan(&epoch); err != nil {
		return j, err
	}
	j = Job{ID: rand.Text(), AssistantID: assistant, Scope: scope, From: sources[0].Seq, To: sources[len(sources)-1].Seq, Hash: hash, CursorRevision: revision, EraseEpoch: epoch, State: "queued", Sources: sources}
	var existing string
	err = tx.QueryRow("SELECT job_id FROM consolidation_jobs WHERE idempotency_key=?", key).Scan(&existing)
	if err == nil {
		j.ID = existing
		_, err = tx.Exec("UPDATE consolidation_jobs SET state='queued',erase_epoch=?,base_cursor_revision=?,run_id=NULL,last_error='',updated_at=? WHERE job_id=? AND state IN ('failed','cancelled')", epoch, revision, storage.Now(), existing)
		return j, err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return j, err
	}
	_, err = tx.Exec(`INSERT INTO consolidation_jobs(job_id,assistant_id,scope_type,scope_id,from_eligible_seq,to_eligible_seq,input_hash,extractor_version,base_cursor_revision,idempotency_key,state,erase_epoch,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'queued',?,?,?)`, j.ID, assistant, scope.Type, scope.ID, j.From, j.To, hash, Extractor, revision, key, epoch, storage.Now(), storage.Now())
	return j, err
}

func LoadJob(tx *sql.Tx, id string) (Job, error) {
	var j Job
	err := tx.QueryRow("SELECT job_id,assistant_id,scope_type,scope_id,from_eligible_seq,to_eligible_seq,input_hash,base_cursor_revision,fencing_token,erase_epoch,state,last_error FROM consolidation_jobs WHERE job_id=?", id).Scan(&j.ID, &j.AssistantID, &j.Scope.Type, &j.Scope.ID, &j.From, &j.To, &j.Hash, &j.CursorRevision, &j.Fence, &j.EraseEpoch, &j.State, &j.Error)
	return j, err
}

func LeaseJob(tx *sql.Tx, id, run string) (int64, error) {
	now := storage.Now()
	until := time.Now().UTC().Add(120 * time.Second).Format("2006-01-02T15:04:05.000Z")
	res, err := tx.Exec("UPDATE consolidation_jobs SET state='running',lease_owner=?,lease_until=?,fencing_token=fencing_token+1,attempt_count=attempt_count+1,updated_at=? WHERE job_id=? AND state='queued'", run, until, now, id)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		return 0, errors.New("整理任务租约不可用")
	}
	var fence int64
	err = tx.QueryRow("SELECT fencing_token FROM consolidation_jobs WHERE job_id=?", id).Scan(&fence)
	return fence, err
}

func CommitJob(tx *sql.Tx, id, run string, fence int64, output string) error {
	j, err := LoadJob(tx, id)
	if err != nil {
		return err
	}
	var owner, until string
	var epoch int64
	if err = tx.QueryRow("SELECT COALESCE(lease_owner,''),COALESCE(lease_until,'') FROM consolidation_jobs WHERE job_id=?", id).Scan(&owner, &until); err != nil {
		return err
	}
	if err = tx.QueryRow("SELECT erase_epoch FROM assistants WHERE assistant_id=?", j.AssistantID).Scan(&epoch); err != nil {
		return err
	}
	if j.State != "running" || j.Fence != fence || owner != run || until < storage.Now() || epoch != j.EraseEpoch {
		return errors.New("STALE_CONSOLIDATION: 整理租约或删除版本已变化")
	}
	var revision int64
	if err = tx.QueryRow("SELECT revision FROM consolidation_cursors WHERE assistant_id=? AND scope_type=? AND scope_id=? AND extractor_version=?", j.AssistantID, j.Scope.Type, j.Scope.ID, Extractor).Scan(&revision); err != nil {
		return err
	}
	if revision != j.CursorRevision {
		return errors.New("整理游标已变化")
	}
	var result struct {
		Proposals []Proposal `json:"proposals"`
	}
	output = strings.TrimSpace(output)
	output = strings.TrimPrefix(output, "```json")
	output = strings.TrimPrefix(output, "```")
	output = strings.TrimSuffix(output, "```")
	if err = json.Unmarshal([]byte(output), &result); err != nil {
		return errors.New("整理模型未返回有效 JSON")
	}
	if len(result.Proposals) > 32 {
		return errors.New("整理提议超过 32 条")
	}
	rows, err := tx.Query(`SELECT e.eligible_seq,e.source_event_id,d.scope_id,d.aggregate_id,e.source_hash FROM memory_eligible_events e JOIN domain_events d ON d.event_id=e.source_event_id WHERE e.assistant_id=? AND e.scope_type=? AND e.scope_id=? AND e.eligible_seq BETWEEN ? AND ? ORDER BY e.eligible_seq`, j.AssistantID, j.Scope.Type, j.Scope.ID, j.From, j.To)
	if err != nil {
		return err
	}
	sources := []Source{}
	for rows.Next() {
		var s Source
		if err = rows.Scan(&s.Seq, &s.EventID, &s.SessionID, &s.MessageID, &s.Hash); err != nil {
			rows.Close()
			return err
		}
		sources = append(sources, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	allowed := map[string]Source{}
	for _, s := range sources {
		allowed[s.MessageID] = s
	}
	for _, p := range result.Proposals {
		if _, ok := allowed[p.MessageID]; !ok || p.ID != "" {
			return errors.New("整理模型引用了批次外来源或试图覆盖现有记忆")
		}
	}
	for _, s := range sources {
		disposition := "no_candidate"
		refs := []any{}
		_, hash, _, sourceErr := source(tx, s.SessionID, s.MessageID)
		if sourceErr != nil || hash != s.Hash {
			disposition = "rejected"
		} else {
			for index, p := range result.Proposals {
				if p.MessageID != s.MessageID {
					continue
				}
				p.CommandID = fmt.Sprintf("%s:%d", id, index)
				p.SessionID = s.SessionID
				p.ScopeType = j.Scope.Type
				_, currentScopes, scopeErr := Scopes(tx, s.SessionID)
				if scopeErr != nil {
					return scopeErr
				}
				sameScope := false
				for _, scope := range currentScopes {
					if scope == j.Scope {
						sameScope = true
					}
				}
				if !sameScope {
					return errors.New("整理来源的项目范围已经变化")
				}
				// One rejected proposal must not leave partial slot/provenance mutations.
				if _, err = tx.Exec("SAVEPOINT memory_proposal"); err != nil {
					return err
				}
				item, publishErr := Publish(tx, p, false)
				if publishErr != nil {
					if _, err = tx.Exec("ROLLBACK TO memory_proposal"); err != nil {
						return err
					}
					if strings.Contains(publishErr.Error(), "MEMORY_CONFLICT") {
						return publishErr
					}
					disposition = "rejected"
					refs = append(refs, map[string]string{"reason": publishErr.Error()})
				} else {
					disposition = "published"
					refs = append(refs, map[string]any{"memory_id": item.ID, "revision": item.Revision})
				}
				if _, err = tx.Exec("RELEASE memory_proposal"); err != nil {
					return err
				}
			}
		}
		raw, _ := json.Marshal(refs)
		if _, err = tx.Exec("INSERT INTO consolidation_results VALUES(?,?,?,?)", id, s.Seq, disposition, string(raw)); err != nil {
			return err
		}
	}
	if _, err = tx.Exec("UPDATE consolidation_cursors SET last_eligible_seq=?,revision=revision+1 WHERE assistant_id=? AND scope_type=? AND scope_id=? AND extractor_version=?", j.To, j.AssistantID, j.Scope.Type, j.Scope.ID, Extractor); err != nil {
		return err
	}
	_, err = tx.Exec("UPDATE consolidation_jobs SET state='succeeded',lease_owner=NULL,lease_until=NULL,updated_at=?,last_error='' WHERE job_id=?", storage.Now(), id)
	return err
}
