package chat

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/Duye0120/Chela/native/internal/memory"
	"github.com/Duye0120/Chela/native/internal/storage"
)

func safePrefix(tx *sql.Tx, run Run, first string, rebuild bool) (int64, string, string, error) {
	rows, err := tx.Query(`WITH RECURSIVE path AS (SELECT e.* FROM pi_entries e JOIN branches b ON e.session_id=b.session_id AND e.entry_id=b.active_leaf_id WHERE b.branch_id=? UNION ALL SELECT e.* FROM pi_entries e JOIN path p ON e.session_id=p.session_id AND e.entry_id=p.parent_id) SELECT entry_id,entry_ordinal,payload_json,payload_hash,erased_at FROM path ORDER BY entry_ordinal`, run.BranchID)
	if err != nil {
		return 0, "", "", err
	}
	defer rows.Close()
	var cut int64
	sources := []map[string]any{}
	prefixMessages := []json.RawMessage{}
	hashes := []string{}
	found := false
	tailUser := false
	prefixIDs := map[string]bool{}
	for rows.Next() {
		var id, raw, hash string
		var ordinal int64
		var erased sql.NullString
		if err := rows.Scan(&id, &ordinal, &raw, &hash, &erased); err != nil {
			return 0, "", "", err
		}
		if erased.Valid {
			return 0, "", "", errors.New("压缩来源已被删除")
		}
		var entry piEntry
		if err := json.Unmarshal([]byte(raw), &entry); err != nil {
			return 0, "", "", err
		}
		if id == first {
			found = true
			cut = ordinal
			if entry.Message.Role == "toolResult" {
				return 0, "", "", errors.New("压缩边界不能切断工具批次")
			}
		}
		if found && !rebuild {
			if entry.Type == "context_edit" && prefixIDs[entry.Target] {
				return 0, "", "", errors.New("压缩来源的上下文已被编辑，请重新选择完整边界")
			}
			if entry.Message.Role == "user" {
				tailUser = true
			}
			continue
		}
		if rebuild && entry.Message.Role == "user" {
			tailUser = true
		}
		sources = append(sources, map[string]any{"entry_id": id, "payload_hash": hash, "entry_ordinal": ordinal})
		prefixIDs[id] = true
		hashes = append(hashes, hash)
		if entry.Type == "message" {
			var object map[string]json.RawMessage
			_ = json.Unmarshal([]byte(raw), &object)
			prefixMessages = append(prefixMessages, object["message"])
		}
	}
	if err := rows.Err(); err != nil {
		return 0, "", "", err
	}
	if !found || len(sources) == 0 || !tailUser {
		return 0, "", "", errors.New("没有完整安全的旧轮次可压缩；最近用户轮次必须保留")
	}
	if rebuild {
		if sources[0]["entry_id"] != first {
			return 0, "", "", errors.New("重建必须保留全部原始历史")
		}
		var status string
		if err := tx.QueryRow(`WITH RECURSIVE path AS (SELECT e.* FROM pi_entries e JOIN branches b ON e.session_id=b.session_id AND e.entry_id=b.active_leaf_id WHERE b.branch_id=? UNION ALL SELECT e.* FROM pi_entries e JOIN path p ON e.session_id=p.session_id AND e.entry_id=p.parent_id) SELECT COALESCE((SELECT status FROM context_snapshots WHERE compaction_entry_id=path.entry_id AND branch_id IN (SELECT branch_id FROM branches WHERE session_id=?)),'') FROM path WHERE entry_type='compaction' ORDER BY entry_ordinal DESC LIMIT 1`, run.BranchID, run.SessionID).Scan(&status); err != nil {
			return 0, "", "", err
		}
		if status != "erased" {
			return 0, "", "", errors.New("此上下文不需要删除后重建")
		}
	}
	if err := validateToolPairs(prefixMessages); err != nil {
		return 0, "", "", err
	}
	data, err := json.Marshal(sources)
	return cut, storage.Hash([]byte(strings.Join(hashes, "\n"))), string(data), err
}

func (c *Chat) prepareSafeCut(ctx context.Context, run Run, raw json.RawMessage) (any, error) {
	var p struct {
		First     string `json:"first_kept_entry_id"`
		Rebuild   bool   `json:"rebuild"`
		Automatic bool   `json:"automatic"`
	}
	if json.Unmarshal(raw, &p) != nil || p.First == "" {
		return nil, errors.New("压缩缺少保留边界")
	}
	token := rand.Text()
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		if err := validateLease(tx, run); err != nil {
			return err
		}
		if p.Automatic {
			var failures int
			if err := tx.QueryRow(`SELECT count(*) FROM safe_cuts c JOIN runs r ON r.run_id=c.run_id WHERE c.branch_id=? AND c.purpose='compact' AND c.consumed_at IS NULL AND r.state IN ('failed','interrupted') AND c.rowid>COALESCE((SELECT max(rowid) FROM safe_cuts WHERE branch_id=? AND consumed_at IS NOT NULL AND purpose='compact'),0)`, run.BranchID, run.BranchID).Scan(&failures); err != nil {
				return err
			}
			if failures >= 3 {
				return errors.New("连续三次整理失败，自动整理已暂停；请手动整理或更换模型")
			}
		}
		cut, hash, sources, err := safePrefix(tx, run, p.First, p.Rebuild)
		if err != nil {
			return err
		}
		var revision, epoch int64
		if err := tx.QueryRow("SELECT b.canonical_revision,a.erase_epoch FROM branches b JOIN sessions s ON s.session_id=b.session_id JOIN assistants a ON a.assistant_id=s.assistant_id WHERE b.branch_id=?", run.BranchID).Scan(&revision, &epoch); err != nil {
			return err
		}
		purpose := "compact"
		if p.Rebuild {
			purpose = "rebuild"
		}
		if _, err := tx.Exec("INSERT INTO safe_cuts(token_id,run_id,branch_id,generation,base_revision,erase_epoch,first_kept_entry_id,cut_ordinal,prefix_hash,sources_json,created_at,purpose) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", token, run.ID, run.BranchID, run.Generation, revision, epoch, p.First, cut, hash, sources, storage.Now(), purpose); err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE runs SET phase='compacting' WHERE run_id=?", run.ID)
		return err
	})
	return map[string]string{"safe_cut_token_id": token}, err
}

func validateCompaction(tx *sql.Tx, run Run, entry piEntry, revision int64, token string) error {
	if entry.FirstKept == "" || strings.TrimSpace(entry.Summary) == "" || token == "" {
		return errors.New("压缩缺少 SafeCut 或摘要")
	}
	var first, hash, sources, purpose string
	var generation, epoch, cut, base int64
	err := tx.QueryRow("SELECT first_kept_entry_id,generation,erase_epoch,cut_ordinal,prefix_hash,sources_json,base_revision,purpose FROM safe_cuts WHERE token_id=? AND run_id=? AND branch_id=? AND consumed_at IS NULL", token, run.ID, run.BranchID).Scan(&first, &generation, &epoch, &cut, &hash, &sources, &base, &purpose)
	if err != nil {
		return err
	}
	var currentEpoch int64
	if err := tx.QueryRow("SELECT erase_epoch FROM assistants WHERE assistant_id=?", run.AssistantID).Scan(&currentEpoch); err != nil {
		return err
	}
	if purpose == "rebuild" && entry.Summary != memory.ErasedContext {
		return errors.New("重建不能引入新的摘要内容")
	}
	_, currentHash, _, err := safePrefix(tx, run, first, purpose == "rebuild")
	if err != nil {
		return err
	}
	if first != entry.FirstKept || generation != run.Generation || epoch != currentEpoch || hash != currentHash || base > revision {
		return errors.New("SafeCut 来源或版本改变，压缩未提交")
	}
	summary, _ := json.Marshal(map[string]string{"first_kept_entry_id": entry.FirstKept, "summary": entry.Summary})
	if _, err := tx.Exec(`INSERT INTO context_snapshots(snapshot_id,branch_id,revision,branch_generation,cut_seq,source_prefix_hash,erase_epoch,source_entries_json,compaction_entry_id,safe_cut_token_id,snapshot_json,canonical_revision,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'valid',?)`, rand.Text(), run.BranchID, revision, run.Generation, cut-1, hash, epoch, sources, entry.ID, token, string(summary), revision, storage.Now()); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE safe_cuts SET consumed_at=? WHERE token_id=?", storage.Now(), token); err != nil {
		return err
	}
	_, err = tx.Exec("UPDATE runs SET phase='thinking' WHERE run_id=?", run.ID)
	return err
}
