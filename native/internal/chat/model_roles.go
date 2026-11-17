package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

func (c *Chat) ModelRoles() (map[string]string, error) {
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query("SELECT preference_key,value_json FROM preferences WHERE scope_type='assistant' AND preference_key IN ('model.chat','model.compaction','model.consolidation','model.proactivity','model.embedding','model.effort','model.compactionThreshold','model.compactionEnabled')")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := map[string]string{}
	for rows.Next() {
		var key, raw, model string
		if err := rows.Scan(&key, &raw); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(raw), &model); err != nil {
			return nil, err
		}
		roles[strings.TrimPrefix(key, "model.")] = model
	}
	return roles, rows.Err()
}

func (c *Chat) SetModelRole(role, model string) error {
	if role == "effort" || role == "compactionThreshold" || role == "compactionEnabled" {
		valid := role == "effort" && (model == "off" || model == "low" || model == "medium" || model == "high" || model == "xhigh") || role == "compactionEnabled" && (model == "true" || model == "false")
		if role == "compactionThreshold" {
			value, err := strconv.Atoi(model)
			valid = err == nil && value >= 50 && value <= 90
		}
		if !valid {
			return errors.New("模型默认设置无效")
		}
		return c.saveModelPreference(role, model)
	}
	if role == "embedding" {
		return c.configureEmbedding(model)
	}
	if role != "chat" && role != "compaction" && role != "consolidation" && role != "proactivity" {
		return errors.New("不支持的模型角色")
	}
	_, configs, _, _, err := c.catalog()
	if err != nil {
		return err
	}
	if model != "" {
		if _, ok := configs[model]; !ok {
			return errors.New("模型不在当前目录中")
		}
	}
	return c.saveModelPreference(role, model)
}

func (c *Chat) saveModelPreference(role, model string) error {
	assistant, err := c.store.Identity()
	if err != nil {
		return err
	}
	value, _ := json.Marshal(model)
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,'assistant',?,?,1,?,?) ON CONFLICT(assistant_id,scope_type,scope_id,preference_key) DO UPDATE SET revision=preferences.revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at`, assistant, assistant, "model."+role, string(value), storage.Now())
		return err
	})
}
