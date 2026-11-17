package chat

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/Duye0120/Chela/native/internal/memory"
	"github.com/Duye0120/Chela/native/internal/storage"
)

type encoder struct {
	Generation, Model, URL, Actual, State string
	Dimension                             int
}

const encoderSelect = "SELECT generation,requested_model,gateway_url,actual_model,state,dimension FROM memory_encoders"

func scanEncoder(row interface{ Scan(...any) error }) (encoder, error) {
	var e encoder
	err := row.Scan(&e.Generation, &e.Model, &e.URL, &e.Actual, &e.State, &e.Dimension)
	return e, err
}

func (c *Chat) configureEmbedding(model string) error {
	model = strings.TrimSpace(model)
	if len(model) > 300 || strings.IndexFunc(model, unicode.IsSpace) >= 0 {
		return errors.New("向量模型 ID 无效")
	}
	var cache magpieCatalog
	if err := readOptional(filepath.Join(c.profile, "magpie-catalog.json"), &cache); err != nil {
		return err
	}
	if model != "" && cache.URL == "" {
		return errors.New("请先连接 Magpie，再指定向量模型")
	}
	assistant, err := c.store.Identity()
	if err != nil {
		return err
	}
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		value, _ := json.Marshal(model)
		if _, err := tx.Exec(`INSERT INTO preferences(assistant_id,scope_type,scope_id,preference_key,revision,value_json,updated_at) VALUES(?,'assistant',?,'model.embedding',1,?,?) ON CONFLICT(assistant_id,scope_type,scope_id,preference_key) DO UPDATE SET revision=preferences.revision+1,value_json=excluded.value_json,updated_at=excluded.updated_at`, assistant, assistant, string(value), storage.Now()); err != nil {
			return err
		}
		if model == "" {
			_, err := tx.Exec("UPDATE memory_encoders SET state='retired' WHERE assistant_id=?", assistant)
			return err
		}
		if _, err := tx.Exec("UPDATE memory_encoders SET state='retired' WHERE assistant_id=? AND state='building'", assistant); err != nil {
			return err
		}
		generation := rand.Text()
		if _, err := tx.Exec("INSERT INTO memory_encoders(generation,assistant_id,requested_model,gateway_url,state,created_at) VALUES(?,?,?,?,'building',?)", generation, assistant, model, cache.URL, storage.Now()); err != nil {
			return err
		}
		_, err := tx.Exec(`INSERT INTO outbox(outbox_id,kind,consumer_id,dedupe_key,payload_json,state,next_attempt_at,created_at) SELECT lower(hex(randomblob(16))),'memory.index','memory-index',?||':'||memory_id||':'||current_revision,json_object('memory_id',memory_id,'revision',current_revision),'pending',?,? FROM memories WHERE assistant_id=? AND status IN ('active','disputed')`, generation, storage.Now(), storage.Now(), assistant)
		return err
	})
}

func (c *Chat) embed(ctx context.Context, e encoder, text, purpose string) (*memory.QueryVector, error) {
	overrides, err := c.providerOverrides()
	if err != nil {
		return nil, err
	}
	if !enabled(overrides, "magpie", true) {
		return nil, errors.New("Magpie 已停用，使用词法检索")
	}
	var cache magpieCatalog
	if err := readOptional(filepath.Join(c.profile, "magpie-catalog.json"), &cache); err != nil {
		return nil, err
	}
	if cache.URL != e.URL {
		return nil, errors.New("Magpie 地址已改变，请重新保存向量模型")
	}
	if _, err := modelEndpoint(cache.URL); err != nil {
		return nil, err
	}
	key, err := unseal(cache.Secret)
	if err != nil {
		return nil, err
	}
	id := rand.Text()
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	if _, err = db.ExecContext(ctx, "INSERT INTO embedding_requests VALUES(?,?,?,'started',NULL,?,NULL)", id, e.Generation, purpose, storage.Now()); err != nil {
		return nil, err
	}
	status := "failed"
	var tokens *int
	defer func() {
		_, _ = db.ExecContext(context.Background(), "UPDATE embedding_requests SET status=?,input_tokens=?,ended_at=? WHERE request_id=?", status, tokens, storage.Now(), id)
	}()
	body, _ := json.Marshal(map[string]any{"model": e.Model, "input": text, "encoding_format": "float"})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, cache.URL+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+string(key))
	request.Header.Set("User-Agent", "Chela")
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("向量请求拒绝重定向") }}
	client.Transport = c.network.Transport()
	response, err := client.Do(request)
	if err != nil {
		return nil, errors.New("向量服务未响应，已保留词法检索")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, fmt.Errorf("向量服务返回 HTTP %d", response.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1024*1024+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > 1024*1024 {
		return nil, errors.New("向量响应过大")
	}
	var result struct {
		Model string `json:"model"`
		Data  []struct {
			Embedding []float64 `json:"embedding"`
			Index     int       `json:"index"`
		} `json:"data"`
		Usage struct {
			Tokens *int `json:"prompt_tokens"`
		} `json:"usage"`
	}
	if json.Unmarshal(raw, &result) != nil || len(result.Data) != 1 || result.Data[0].Index != 0 {
		return nil, errors.New("向量响应格式无效")
	}
	actual := response.Header.Get("X-Magpie-Model")
	if actual == "" {
		actual = result.Model
	}
	if actual == "" {
		return nil, errors.New("向量服务未声明实际模型，不能确认向量空间")
	}
	values := result.Data[0].Embedding
	if err = memory.ValidateVector(values); err != nil {
		return nil, err
	}
	if (e.Actual != "" && e.Actual != actual) || (e.Dimension != 0 && e.Dimension != len(values)) {
		return nil, errors.New("向量模型或维度改变，请重新建立索引")
	}
	status = "succeeded"
	tokens = result.Usage.Tokens
	return &memory.QueryVector{Generation: e.Generation, Model: actual, Values: values}, nil
}

func (c *Chat) queryVector(ctx context.Context, text string) *memory.QueryVector {
	if strings.TrimSpace(text) == "" || len(text) > 12000 {
		return nil
	}
	db, err := c.store.DB()
	if err != nil {
		return nil
	}
	e, err := scanEncoder(db.QueryRowContext(ctx, encoderSelect+" WHERE state='active'"))
	if err != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	vector, err := c.embed(ctx, e, text, "query")
	if err != nil {
		return nil
	}
	return vector
}

func (c *Chat) indexMemories() {
	defer c.workers.Done()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-c.lifetime.Done():
			return
		case <-ticker.C:
		}
		db, err := c.store.DB()
		if err != nil {
			return
		}
		var foreground int
		if db.QueryRow("SELECT count(*) FROM runs WHERE lane='foreground' AND state NOT IN ('succeeded','failed','cancelled','interrupted')").Scan(&foreground) == nil && foreground == 0 {
			_ = c.indexMemory(c.lifetime)
		}
	}
}

func (c *Chat) indexMemory(ctx context.Context) error {
	var e encoder
	var item memory.Item
	var outbox, owner string
	var fence, epoch int64
	err := c.store.Update(ctx, func(tx *sql.Tx) error {
		var err error
		e, err = scanEncoder(tx.QueryRow(encoderSelect + " WHERE state IN ('building','active') ORDER BY CASE state WHEN 'building' THEN 0 ELSE 1 END LIMIT 1"))
		if err != nil {
			return err
		}
		var id string
		var revision int64
		err = tx.QueryRow(`SELECT outbox_id,json_extract(payload_json,'$.memory_id'),json_extract(payload_json,'$.revision') FROM outbox WHERE kind='memory.index' AND ((state IN ('pending','failed') AND next_attempt_at<=?) OR (state='leased' AND lease_until<?)) ORDER BY created_at,rowid LIMIT 1`, storage.Now(), storage.Now()).Scan(&outbox, &id, &revision)
		if errors.Is(err, sql.ErrNoRows) {
			var missing int
			if err = tx.QueryRow(`SELECT count(*) FROM memories m WHERE status IN ('active','disputed') AND NOT EXISTS(SELECT 1 FROM embeddings v WHERE v.memory_id=m.memory_id AND v.memory_revision=m.current_revision AND v.encoder_revision=?)`, e.Generation).Scan(&missing); err != nil {
				return err
			}
			if missing == 0 && e.State == "building" {
				if _, err = tx.Exec("UPDATE memory_encoders SET state='retired' WHERE state='active'"); err != nil {
					return err
				}
				_, err = tx.Exec("UPDATE memory_encoders SET state='active' WHERE generation=?", e.Generation)
			}
			return err
		}
		if err != nil {
			return err
		}
		item, err = memory.Get(tx, id)
		if err != nil {
			return err
		}
		if item.Revision != revision || (item.Status != "active" && item.Status != "disputed") {
			_, err = tx.Exec("UPDATE outbox SET state='delivered' WHERE outbox_id=?", outbox)
			outbox = ""
			return err
		}
		owner = rand.Text()
		if _, err = tx.Exec("UPDATE outbox SET state='leased',lease_owner=?,lease_until=?,fencing_token=fencing_token+1,attempt_count=attempt_count+1 WHERE outbox_id=?", owner, time.Now().UTC().Add(time.Minute).Format(time.RFC3339), outbox); err != nil {
			return err
		}
		if err = tx.QueryRow("SELECT fencing_token FROM outbox WHERE outbox_id=?", outbox).Scan(&fence); err != nil {
			return err
		}
		return tx.QueryRow("SELECT erase_epoch FROM assistants").Scan(&epoch)
	})
	if errors.Is(err, sql.ErrNoRows) || outbox == "" {
		return err
	}
	if err != nil {
		return err
	}
	callCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	vector, requestErr := c.embed(callCtx, e, item.Content, "index")
	return c.store.Update(ctx, func(tx *sql.Tx) error {
		var valid int
		if err := tx.QueryRow(`SELECT count(*) FROM outbox WHERE outbox_id=? AND state='leased' AND lease_owner=? AND fencing_token=? AND lease_until>=?`, outbox, owner, fence, storage.Now()).Scan(&valid); err != nil {
			return err
		}
		if valid != 1 {
			return errors.New("索引租约已失效")
		}
		if requestErr != nil {
			_, err := tx.Exec("UPDATE outbox SET state='failed',last_error_code=?,next_attempt_at=?,lease_owner=NULL,lease_until=NULL WHERE outbox_id=?", requestErr.Error(), time.Now().UTC().Add(time.Minute).Format("2006-01-02T15:04:05.000Z"), outbox)
			return err
		}
		if err := tx.QueryRow(`SELECT count(*) FROM memories m JOIN assistants a ON a.assistant_id=m.assistant_id JOIN memory_encoders e ON e.assistant_id=m.assistant_id WHERE m.memory_id=? AND m.current_revision=? AND m.status IN ('active','disputed') AND a.erase_epoch=? AND e.generation=? AND e.state IN ('active','building')`, item.ID, item.Revision, epoch, e.Generation).Scan(&valid); err != nil {
			return err
		}
		if valid == 1 {
			current, err := scanEncoder(tx.QueryRow(encoderSelect+" WHERE generation=?", e.Generation))
			if err != nil {
				return err
			}
			if (current.Actual != "" && current.Actual != vector.Model) || (current.Dimension != 0 && current.Dimension != len(vector.Values)) {
				return errors.New("索引空间已变化")
			}
			data, _ := json.Marshal(vector.Values)
			if _, err = tx.Exec("INSERT OR REPLACE INTO embeddings(memory_id,memory_revision,encoder_id,encoder_revision,dimension,vector,created_at) VALUES(?,?,?,?,?,?,?)", item.ID, item.Revision, vector.Model, e.Generation, len(vector.Values), data, storage.Now()); err != nil {
				return err
			}
			if _, err = tx.Exec("UPDATE memory_encoders SET actual_model=?,dimension=? WHERE generation=?", vector.Model, len(vector.Values), e.Generation); err != nil {
				return err
			}
		} else {
			var retry int
			if err := tx.QueryRow("SELECT count(*) FROM memories m JOIN memory_encoders e ON e.assistant_id=m.assistant_id WHERE m.memory_id=? AND m.current_revision=? AND m.status IN ('active','disputed') AND e.generation=? AND e.state IN ('active','building')", item.ID, item.Revision, e.Generation).Scan(&retry); err != nil {
				return err
			}
			if retry == 1 {
				_, err := tx.Exec("UPDATE outbox SET state='pending',lease_owner=NULL,lease_until=NULL,next_attempt_at=? WHERE outbox_id=?", storage.Now(), outbox)
				return err
			}
		}
		_, err := tx.Exec("UPDATE outbox SET state='delivered',last_error_code=NULL,lease_owner=NULL,lease_until=NULL WHERE outbox_id=?", outbox)
		return err
	})
}

func (c *Chat) MemoryIndexStatus() (map[string]any, error) {
	db, err := c.store.DB()
	if err != nil {
		return nil, err
	}
	var pending int
	var lastError string
	if err = db.QueryRow("SELECT count(*),COALESCE(max(last_error_code),'') FROM outbox WHERE kind='memory.index' AND state!='delivered'").Scan(&pending, &lastError); err != nil {
		return nil, err
	}
	e, err := scanEncoder(db.QueryRow(encoderSelect + " WHERE state IN ('active','building') ORDER BY CASE state WHEN 'building' THEN 0 ELSE 1 END LIMIT 1"))
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	return map[string]any{"model": e.Model, "state": e.State, "pending": pending, "error": lastError}, nil
}
