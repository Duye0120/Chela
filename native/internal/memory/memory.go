package memory

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type Scope struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}
type Proposal struct {
	ID                   string `json:"id,omitempty"`
	CommandID            string `json:"command_id"`
	SessionID            string `json:"session_id"`
	MessageID            string `json:"message_id"`
	ScopeType            string `json:"scope_type"`
	Subject              string `json:"subject"`
	Slot                 string `json:"slot"`
	Kind                 string `json:"kind"`
	Content              string `json:"content"`
	ExpectedRevision     int64  `json:"expected_revision"`
	ExpectedSlotRevision int64  `json:"expected_slot_revision"`
	ValidUntil           string `json:"valid_until,omitempty"`
}
type Item struct {
	ID           string `json:"id"`
	Revision     int64  `json:"revision"`
	SlotRevision int64  `json:"slot_revision"`
	Scope        Scope  `json:"scope"`
	Subject      string `json:"subject"`
	Slot         string `json:"slot"`
	Kind         string `json:"kind"`
	Status       string `json:"status"`
	Content      string `json:"content"`
	SourceClass  string `json:"source_class"`
	SourceID     string `json:"source_id"`
	SourceHash   string `json:"source_hash"`
	RecordedAt   string `json:"recorded_at"`
	ValidUntil   string `json:"valid_until,omitempty"`
}

// Scopes is derived from the host session; a model never supplies scope IDs.
func Scopes(tx *sql.Tx, session string) (string, []Scope, error) {
	var assistant, project string
	err := tx.QueryRow("SELECT assistant_id,COALESCE(project_id,'') FROM sessions WHERE session_id=? AND deleted_at IS NULL", session).Scan(&assistant, &project)
	if err != nil {
		return "", nil, err
	}
	scopes := []Scope{{"assistant", assistant}, {"session", session}}
	if project != "" {
		scopes = append(scopes, Scope{"project", project})
	}
	return assistant, scopes, nil
}

var credential = regexp.MustCompile(`(?i)(?:sk-[a-z0-9_-]{16,}|bearer\s+[a-z0-9._-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|password|密码|token|密钥)\s*[:=：]\s*\S{6,})`)

func Explicit(text string) bool {
	text = strings.ToLower(strings.TrimSpace(text))
	for _, prefix := range []string{"记住", "请记住", "帮我记住", "以后", "今后", "remember ", "from now on "} {
		if strings.HasPrefix(text, prefix) {
			return true
		}
	}
	return false
}

func source(tx *sql.Tx, session, message string) (text, hash, event string, err error) {
	var raw, assistant string
	err = tx.QueryRow(`WITH RECURSIVE path AS (SELECT e.entry_id,e.parent_id FROM pi_entries e JOIN branches b ON b.session_id=e.session_id AND b.active_leaf_id=e.entry_id JOIN sessions s ON s.session_id=b.session_id WHERE s.session_id=? AND b.branch_id=COALESCE(s.active_branch_id,s.session_id||'-main') UNION ALL SELECT e.entry_id,e.parent_id FROM pi_entries e JOIN path p ON e.entry_id=p.parent_id WHERE e.session_id=?) SELECT m.content_json,s.assistant_id FROM messages m JOIN sessions s ON s.session_id=m.session_id WHERE m.message_id=? AND m.session_id=? AND m.role='user' AND m.erased_at IS NULL AND s.deleted_at IS NULL AND (m.message_id LIKE 'memory-user-%' OR (m.entry_id IS NULL AND m.branch_id=COALESCE(s.active_branch_id,s.session_id||'-main')) OR m.entry_id IN (SELECT entry_id FROM path))`, session, session, message, session).Scan(&raw, &assistant)
	if err != nil {
		return
	}
	var value struct {
		Content string `json:"content"`
	}
	err = json.Unmarshal([]byte(raw), &value)
	if err != nil {
		return
	}
	text = value.Content
	hash = storage.Hash([]byte(raw))
	err = tx.QueryRow("SELECT event_id FROM domain_events WHERE aggregate_type='message' AND aggregate_id=? AND event_type='memory.source' AND redacted_at IS NULL", message).Scan(&event)
	if errors.Is(err, sql.ErrNoRows) {
		var seq string
		seq, err = storage.AppendEvent(tx, assistant, "memory.source", "message", message, 1, "session", session, message, map[string]string{"message_id": message, "source_hash": hash})
		if err == nil {
			err = tx.QueryRow("SELECT event_id FROM domain_events WHERE seq=?", seq).Scan(&event)
		}
	}
	return
}

// Publish and its receipt share the caller's transaction, including model tool receipts.
func Publish(tx *sql.Tx, p Proposal, userAction bool) (Item, error) {
	var result Item
	if p.CommandID == "" || len(p.CommandID) > 200 || strings.TrimSpace(p.Content) == "" || utf8.RuneCountInString(p.Content) > 2000 || p.Subject == "" || len(p.Subject) > 200 || p.Slot == "" || len(p.Slot) > 200 {
		return result, errors.New("记忆内容、主题、键或提交标识无效")
	}
	if credential.MatchString(p.Content) {
		return result, errors.New("凭据原文不能保存为记忆")
	}
	switch p.Kind {
	case "preference", "fact", "decision", "procedure", "episode":
	default:
		return result, errors.New("记忆类型无效")
	}
	if p.ValidUntil != "" {
		expiry, err := time.Parse(time.RFC3339, p.ValidUntil)
		if err != nil || !expiry.After(time.Now()) {
			return result, errors.New("记忆有效期必须晚于现在")
		}
		p.ValidUntil = expiry.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	request, _ := json.Marshal(p)
	var prior, receipt string
	err := tx.QueryRow("SELECT payload_json,COALESCE(result_json,'') FROM memory_proposals WHERE idempotency_key=?", p.CommandID).Scan(&prior, &receipt)
	if err == nil {
		if prior != string(request) {
			return result, errors.New("IDEMPOTENCY_CONFLICT: 记忆提交标识已使用")
		}
		err = json.Unmarshal([]byte(receipt), &result)
		return result, err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return result, err
	}
	assistant, scopes, err := Scopes(tx, p.SessionID)
	if err != nil {
		return result, err
	}
	var scope Scope
	for _, s := range scopes {
		if s.Type == p.ScopeType {
			scope = s
		}
	}
	if scope.ID == "" {
		return result, errors.New("当前会话无权使用此记忆范围")
	}
	text, hash, event, err := source(tx, p.SessionID, p.MessageID)
	if err != nil {
		return result, fmt.Errorf("记忆来源无效: %w", err)
	}
	if credential.MatchString(text) {
		return result, errors.New("来源含凭据，请先移除敏感内容")
	}
	var blocked int
	if err = tx.QueryRow("SELECT count(*) FROM erasure_rules WHERE assistant_id=? AND source_type='event' AND source_id=?", assistant, event).Scan(&blocked); err != nil {
		return result, err
	}
	if blocked > 0 {
		return result, errors.New("来源已被遗忘屏蔽，不能重新提取")
	}
	status, class, certainty := "candidate", "model_inference", "uncertain"
	if userAction || Explicit(text) {
		status, class, certainty = "active", "explicit_user", "asserted"
	}
	if !userAction && status == "active" && !strings.Contains(text, p.Content) {
		return result, errors.New("显式记忆必须逐字引用来源，改写只能由用户确认")
	}
	// Automatic proposals from project conversations cannot promote project data globally.
	if !userAction && scope.Type == "assistant" && len(scopes) > 2 {
		return result, errors.New("项目内容需由用户在记忆界面明确选择全局范围")
	}
	now := storage.Now()
	if _, err = tx.Exec(`INSERT INTO memory_slots(assistant_id,scope_type,scope_id,subject_id,slot_key) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING`, assistant, scope.Type, scope.ID, p.Subject, p.Slot); err != nil {
		return result, err
	}
	var slotRevision int64
	var preferred string
	if err = tx.QueryRow(`SELECT revision,COALESCE(preferred_memory_id,'') FROM memory_slots WHERE assistant_id=? AND scope_type=? AND scope_id=? AND subject_id=? AND slot_key=?`, assistant, scope.Type, scope.ID, p.Subject, p.Slot).Scan(&slotRevision, &preferred); err != nil {
		return result, err
	}
	if slotRevision != p.ExpectedSlotRevision {
		return result, errors.New("MEMORY_CONFLICT: 此主题已更新，请刷新后再修改")
	}
	revision := int64(1)
	if p.ID != "" {
		var old Item
		old, err = Get(tx, p.ID)
		if err != nil {
			return result, err
		}
		if old.Revision != p.ExpectedRevision || old.Scope != scope || old.Subject != p.Subject || old.Slot != p.Slot || old.Status == "erased" {
			return result, errors.New("MEMORY_CONFLICT: 记忆版本或范围已经变化")
		}
		if !userAction {
			return result, errors.New("自动提取只能提出新候选，纠正现有记忆须用户确认")
		}
		revision = old.Revision + 1
	} else {
		if p.ExpectedRevision != 0 {
			return result, errors.New("新记忆版本必须为零")
		}
		p.ID = rand.Text()
	}
	conflict := ""
	if preferred != "" && preferred != p.ID && status == "active" {
		status = "disputed"
		conflict = rand.Text()
		if _, err = tx.Exec("UPDATE memories SET status='disputed',conflict_group_id=? WHERE memory_id=? AND status IN ('active','disputed')", conflict, preferred); err != nil {
			return result, err
		}
	}
	if revision == 1 {
		_, err = tx.Exec(`INSERT INTO memories(memory_id,assistant_id,scope_type,scope_id,subject_id,slot_key,kind,current_revision,status,conflict_group_id,valid_from,valid_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,NULLIF(?,''),?,NULLIF(?,''),?)`, p.ID, assistant, scope.Type, scope.ID, p.Subject, p.Slot, p.Kind, revision, status, conflict, now, p.ValidUntil, now)
	} else {
		_, err = tx.Exec("UPDATE memories SET current_revision=?,status=?,valid_from=?,valid_until=NULLIF(?,''),conflict_group_id=NULL WHERE memory_id=?", revision, status, now, p.ValidUntil, p.ID)
	}
	if err != nil {
		return result, err
	}
	if _, err = tx.Exec(`INSERT INTO memory_revisions(memory_id,revision,content,content_hash,source_class,certainty,valid_from,valid_until,recorded_at) VALUES(?,?,?,?,?,?,?,NULLIF(?,''),?)`, p.ID, revision, p.Content, storage.Hash([]byte(p.Content)), class, certainty, now, p.ValidUntil, now); err != nil {
		return result, err
	}
	spanStart, spanEnd := 0, utf8.RuneCountInString(text)
	if index := strings.Index(text, p.Content); index >= 0 {
		spanStart = utf8.RuneCountInString(text[:index])
		spanEnd = spanStart + utf8.RuneCountInString(p.Content)
	}
	if _, err = tx.Exec("INSERT INTO memory_provenance VALUES(?,?,'event',?,1,?,'user',?,?)", p.ID, revision, event, hash, spanStart, spanEnd); err != nil {
		return result, err
	}
	if _, err = tx.Exec("INSERT INTO derivations VALUES('event',?,1,'memory',?,?)", event, p.ID, revision); err != nil {
		return result, err
	}
	if userAction && revision > 1 {
		if _, err = tx.Exec("UPDATE memories SET status='superseded' WHERE assistant_id=? AND scope_type=? AND scope_id=? AND subject_id=? AND slot_key=? AND memory_id<>? AND status IN ('active','disputed')", assistant, scope.Type, scope.ID, p.Subject, p.Slot, p.ID); err != nil {
			return result, err
		}
		if _, err = tx.Exec("UPDATE memory_revisions SET supersedes_memory_id=?,supersedes_revision=? WHERE memory_id=? AND revision=?", p.ID, revision-1, p.ID, revision); err != nil {
			return result, err
		}
	}
	if status != "candidate" {
		preferred = p.ID
	}
	if _, err = tx.Exec(`UPDATE memory_slots SET revision=revision+1,preferred_memory_id=NULLIF(?,''),conflict_group_id=NULLIF(?,'') WHERE assistant_id=? AND scope_type=? AND scope_id=? AND subject_id=? AND slot_key=?`, preferred, conflict, assistant, scope.Type, scope.ID, p.Subject, p.Slot); err != nil {
		return result, err
	}
	if _, err = tx.Exec(`INSERT INTO memory_search(memory_id,revision,search_tokens,tokenizer_version) VALUES(?,?,?,'han-bigram-v1') ON CONFLICT(memory_id) DO UPDATE SET revision=excluded.revision,search_tokens=excluded.search_tokens`, p.ID, revision, Tokens(p.Subject+" "+p.Slot+" "+p.Content)); err != nil {
		return result, err
	}
	if err = bumpScope(tx, assistant, scope, false); err != nil {
		return result, err
	}
	if _, err = storage.AppendEvent(tx, assistant, "memory."+status, "memory", p.ID, revision, scope.Type, scope.ID, p.CommandID, map[string]any{"memory_id": p.ID, "revision": revision}); err != nil {
		return result, err
	}
	if _, err = tx.Exec(`INSERT INTO outbox(outbox_id,kind,consumer_id,dedupe_key,payload_json,state,next_attempt_at,created_at) VALUES(?,'memory.index','memory-index',?,?,'pending',?,?)`, rand.Text(), fmt.Sprintf("memory:%s:%d", p.ID, revision), fmt.Sprintf(`{"memory_id":%q,"revision":%d}`, p.ID, revision), now, now); err != nil {
		return result, err
	}
	result, err = Get(tx, p.ID)
	if err != nil {
		return result, err
	}
	encoded, _ := json.Marshal(result)
	_, err = tx.Exec("INSERT INTO memory_proposals(proposal_id,assistant_id,idempotency_key,payload_json,status,result_json,created_at) VALUES(?,?,?,?,'published',?,?)", rand.Text(), assistant, p.CommandID, string(request), string(encoded), now)
	return result, err
}

func bumpScope(tx *sql.Tx, assistant string, scope Scope, erase bool) error {
	inc := 0
	if erase {
		inc = 1
	}
	_, err := tx.Exec(`INSERT INTO scope_epochs(assistant_id,scope_type,scope_id,revision,erase_epoch) VALUES(?,?,?,1,?) ON CONFLICT(assistant_id,scope_type,scope_id) DO UPDATE SET revision=scope_epochs.revision+1,erase_epoch=scope_epochs.erase_epoch+excluded.erase_epoch`, assistant, scope.Type, scope.ID, inc)
	return err
}

const itemSelect = `SELECT m.memory_id,m.current_revision,s.revision,m.scope_type,m.scope_id,m.subject_id,m.slot_key,m.kind,m.status,COALESCE(r.content,'') AS content,r.source_class,COALESCE(p.source_id,''),COALESCE(p.source_hash,''),r.recorded_at,COALESCE(m.valid_until,'') FROM memories m JOIN memory_revisions r ON r.memory_id=m.memory_id AND r.revision=m.current_revision JOIN memory_slots s ON s.assistant_id=m.assistant_id AND s.scope_type=m.scope_type AND s.scope_id=m.scope_id AND s.subject_id=m.subject_id AND s.slot_key=m.slot_key LEFT JOIN memory_provenance p ON p.memory_id=m.memory_id AND p.memory_revision=m.current_revision AND p.source_type='event'`

func scan(row interface{ Scan(...any) error }) (Item, error) {
	var i Item
	err := row.Scan(&i.ID, &i.Revision, &i.SlotRevision, &i.Scope.Type, &i.Scope.ID, &i.Subject, &i.Slot, &i.Kind, &i.Status, &i.Content, &i.SourceClass, &i.SourceID, &i.SourceHash, &i.RecordedAt, &i.ValidUntil)
	return i, err
}
func Get(tx *sql.Tx, id string) (Item, error) {
	return scan(tx.QueryRow(itemSelect+" WHERE m.memory_id=?", id))
}

func Forget(tx *sql.Tx, id string, expected int64) error {
	i, err := Get(tx, id)
	if err != nil {
		return err
	}
	if i.Status == "erased" {
		return nil
	}
	if i.Revision != expected {
		return errors.New("MEMORY_CONFLICT: 请刷新后再遗忘")
	}
	var assistant string
	if err = tx.QueryRow("SELECT assistant_id FROM memories WHERE memory_id=?", id).Scan(&assistant); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE assistants SET erase_epoch=erase_epoch+1 WHERE assistant_id=?", assistant); err != nil {
		return err
	}
	var epoch int64
	if err = tx.QueryRow("SELECT erase_epoch FROM assistants WHERE assistant_id=?", assistant).Scan(&epoch); err != nil {
		return err
	}
	now := storage.Now()
	if _, err = tx.Exec(`INSERT OR IGNORE INTO erasure_rules(rule_id,assistant_id,scope_type,scope_id,source_type,source_id,source_revision,erase_epoch,mode,created_at) SELECT lower(hex(randomblob(16))),?, ?,?,source_type,source_id,source_revision,?,'forget_memory',? FROM memory_provenance WHERE memory_id=?`, assistant, i.Scope.Type, i.Scope.ID, epoch, now, id); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE memories SET status='erased',erase_epoch=? WHERE memory_id=?", epoch, id); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE memory_revisions SET content=NULL,erased_at=? WHERE memory_id=?", now, id); err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM memory_search WHERE memory_id=?", id); err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM embeddings WHERE memory_id=?", id); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE memory_proposals SET payload_json='{}',result_json='{}' WHERE json_extract(result_json,'$.id')=?", id); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE legacy_memory_candidates SET content=NULL,state='erased' WHERE memory_id=?", id); err != nil {
		return err
	}
	if err = clearDerivedContext(tx, assistant, now); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE memory_slots SET revision=revision+1,preferred_memory_id=NULL WHERE preferred_memory_id=?", id); err != nil {
		return err
	}
	if err = bumpScope(tx, assistant, i.Scope, true); err != nil {
		return err
	}
	_, err = storage.AppendEvent(tx, assistant, "memory.erased", "memory", id, expected+1, i.Scope.Type, i.Scope.ID, id, map[string]string{"memory_id": id})
	return err
}
