package maintenance

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"

	"github.com/Duye0120/Chela/native/internal/memory"
	"github.com/Duye0120/Chela/native/internal/storage"
)

func applyCurrentDeletions(target *storage.Store, current string) error {
	info, err := os.Stat(current)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return errors.New("当前资料路径不是目录")
	}
	path := filepath.Join(current, "chela.db")
	if _, err = os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	dir, err := os.MkdirTemp("", "chela-erasure-frontier-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	if err = snapshotDB(path, filepath.Join(dir, "chela.db")); err != nil {
		return err
	}
	latest := storage.New(dir)
	latestID, err := latest.Identity()
	if err = closeStore(latest, err); err != nil {
		return err
	}
	identity, err := target.Identity()
	if err != nil {
		return err
	}
	if latestID != identity {
		return errors.New("当前资料与备份不属于同一个 Chela 身份")
	}
	db, err := target.DB()
	if err != nil {
		return err
	}
	if _, err = db.Exec("ATTACH DATABASE ? AS deletion_frontier", filepath.Join(dir, "chela.db")); err != nil {
		return err
	}
	defer db.Exec("DETACH DATABASE deletion_frontier")
	return target.Update(context.Background(), func(tx *sql.Tx) error {
		var unsupported int
		if err := tx.QueryRow("SELECT count(*) FROM deletion_frontier.erasure_rules WHERE mode<>'forget_memory'").Scan(&unsupported); err != nil {
			return err
		}
		if unsupported > 0 {
			return errors.New("当前删除登记含尚不支持的正文删除格式，已拒绝恢复；原资料保持可用")
		}
		rows, err := tx.Query(`SELECT m.memory_id,m.current_revision FROM memories m WHERE m.status<>'erased' AND (m.memory_id IN (SELECT memory_id FROM deletion_frontier.memories WHERE status='erased') OR EXISTS (SELECT 1 FROM memory_provenance p JOIN deletion_frontier.erasure_rules r ON p.source_type=r.source_type AND p.source_id=r.source_id WHERE p.memory_id=m.memory_id))`)
		if err != nil {
			return err
		}
		type erased struct {
			id       string
			revision int64
		}
		items := []erased{}
		for rows.Next() {
			var item erased
			if err = rows.Scan(&item.id, &item.revision); err != nil {
				rows.Close()
				return err
			}
			items = append(items, item)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, item := range items {
			if err = memory.Forget(tx, item.id, item.revision); err != nil {
				return err
			}
		}
		for _, q := range []string{
			"INSERT OR IGNORE INTO erasure_rules SELECT * FROM deletion_frontier.erasure_rules",
			"UPDATE assistants SET erase_epoch=max(erase_epoch,(SELECT erase_epoch FROM deletion_frontier.assistants WHERE assistant_id=assistants.assistant_id))",
			"UPDATE sessions SET deleted_at=(SELECT deleted_at FROM deletion_frontier.sessions x WHERE x.session_id=sessions.session_id) WHERE session_id IN (SELECT session_id FROM deletion_frontier.sessions WHERE deleted_at IS NOT NULL)",
			"UPDATE planner_items SET deleted_at=(SELECT deleted_at FROM deletion_frontier.planner_items x WHERE x.item_id=planner_items.item_id),revision=revision+1 WHERE item_id IN (SELECT item_id FROM deletion_frontier.planner_items WHERE deleted_at IS NOT NULL)",
			"UPDATE messages SET erased_at=(SELECT erased_at FROM deletion_frontier.messages x WHERE x.message_id=messages.message_id),content_json='{}' WHERE message_id IN (SELECT message_id FROM deletion_frontier.messages WHERE erased_at IS NOT NULL)",
			"UPDATE legacy_memory_candidates SET content=NULL,state='erased' WHERE candidate_id IN (SELECT candidate_id FROM deletion_frontier.legacy_memory_candidates WHERE state='erased')",
			"UPDATE blobs SET state='erased' WHERE blob_id IN (SELECT blob_id FROM deletion_frontier.blobs WHERE state='erased')",
		} {
			if _, err = tx.Exec(q); err != nil {
				return err
			}
		}
		return nil
	})
}
