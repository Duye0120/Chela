package memory

import (
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/Duye0120/Chela/native/internal/storage"
)

const ErasedContext = "旧派生记忆已清理；以下原始对话保留，不代表允许重新记忆。"

// shortcut: 缺少逐段依赖时清理同身份的全部派生摘要，具备完整来源映射后缩小范围。
func clearDerivedContext(tx *sql.Tx, assistant, now string) error {
	rows, err := tx.Query(`SELECT session_id,entry_id,payload_json FROM pi_entries WHERE session_id IN (SELECT session_id FROM sessions WHERE assistant_id=?) AND (entry_type IN ('compaction','branch_summary') OR (entry_type IN ('message','custom_message') AND session_id IN (SELECT session_id FROM sessions WHERE kind='internal')) OR (json_extract(payload_json,'$.message.role')='toolResult' AND json_extract(payload_json,'$.message.toolName') IN ('memory_search','memory_save')))`, assistant)
	if err != nil {
		return err
	}
	type changed struct{ session, id, payload string }
	var changes []changed
	for rows.Next() {
		var item changed
		if err = rows.Scan(&item.session, &item.id, &item.payload); err != nil {
			rows.Close()
			return err
		}
		var entry map[string]any
		if err = json.Unmarshal([]byte(item.payload), &entry); err != nil {
			rows.Close()
			return err
		}
		if entry["type"] == "message" {
			message, ok := entry["message"].(map[string]any)
			if !ok {
				rows.Close()
				return errors.New("无法清理无效的历史消息")
			}
			message["content"] = []map[string]string{{"type": "text", "text": ErasedContext}}
			delete(message, "details")
		} else if entry["type"] == "custom_message" {
			entry["content"] = ErasedContext
			delete(entry, "details")
		} else {
			entry["summary"] = ErasedContext
			delete(entry, "systemMessage")
			delete(entry, "details")
		}
		data, e := json.Marshal(entry)
		if e != nil {
			rows.Close()
			return e
		}
		item.payload = string(data)
		changes = append(changes, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, item := range changes {
		if _, err = tx.Exec("UPDATE pi_entries SET payload_json=?,payload_hash=? WHERE session_id=? AND entry_id=?", item.payload, storage.Hash([]byte(item.payload)), item.session, item.id); err != nil {
			return err
		}
		if _, err = tx.Exec("UPDATE messages SET content_json=json_set(content_json,'$.content',?) WHERE session_id=? AND entry_id=? AND role='toolResult'", ErasedContext, item.session, item.id); err != nil {
			return err
		}
	}
	result, _ := json.Marshal(map[string]any{"content": []map[string]string{{"type": "text", "text": ErasedContext}}, "details": map[string]any{}})
	if _, err = tx.Exec("UPDATE tool_invocations SET result_json=?,result_hash=?,final_args_json='{}' WHERE run_id IN (SELECT run_id FROM runs WHERE assistant_id=?) AND tool_id IN ('memory_search','memory_save')", string(result), storage.Hash(result), assistant); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE context_manifests SET manifest_json='{}',erased_at=? WHERE run_id IN (SELECT run_id FROM runs WHERE assistant_id=?)", now, assistant); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE context_snapshots SET snapshot_json='{}',status='erased' WHERE branch_id IN (SELECT b.branch_id FROM branches b JOIN sessions s ON s.session_id=b.session_id WHERE s.assistant_id=?)", assistant); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE messages SET content_json=json_set(content_json,'$.content',?) WHERE session_id IN (SELECT session_id FROM sessions WHERE assistant_id=? AND kind='internal')", ErasedContext, assistant); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE consolidation_results SET result_json='{}' WHERE job_id IN (SELECT job_id FROM consolidation_jobs WHERE assistant_id=?)", assistant); err != nil {
		return err
	}
	_, err = tx.Exec("UPDATE branches SET canonical_revision=canonical_revision+1 WHERE session_id IN (SELECT session_id FROM sessions WHERE assistant_id=?)", assistant)
	return err
}
