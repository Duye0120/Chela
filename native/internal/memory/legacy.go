package memory

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type LegacyCandidate struct {
	ID      string          `json:"id"`
	Content string          `json:"content"`
	Sources json.RawMessage `json:"sources"`
	State   string          `json:"state"`
}
type legacyRecord struct{ System, ID, Content, Hash string }

// Legacy files remain the rollback archive; only claims awaiting classification are copied.
func ImportLegacy(store *storage.Store, profile string) error {
	db, err := store.DB()
	if err != nil {
		return err
	}
	var imported int
	if err = db.QueryRow("SELECT count(*) FROM import_receipts WHERE source='memory-legacy-v1'").Scan(&imported); err != nil || imported > 0 {
		return err
	}
	var records []legacyRecord
	indexTopics := map[string]string{}
	topicBlocks := map[string]string{}
	index := filepath.Join(profile, "data", "memory", "MEMORY.md")
	if data, err := readLegacyFile(index); err == nil {
		linePattern := regexp.MustCompile(`(?m)^-\s+(.+?)\s+\[→\s*topics/([^\]]+?)\.md\]\s*$`)
		for n, match := range linePattern.FindAllStringSubmatch(string(data), -1) {
			id := fmt.Sprint(n)
			records = append(records, legacyRecord{"memdir-index", id, strings.TrimSpace(match[1]), storage.Hash([]byte(match[0]))})
			indexTopics[id] = match[2] + "\n" + strings.TrimSpace(match[1])
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	topics := filepath.Join(profile, "data", "memory", "topics")
	files, err := os.ReadDir(topics)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(strings.ToLower(file.Name()), ".md") {
			continue
		}
		path := filepath.Join(topics, file.Name())
		data, err := readLegacyFile(path)
		if err != nil {
			return err
		}
		headings := regexp.MustCompile(`(?m)^###\s+(.+)\r?$`).FindAllStringSubmatchIndex(string(data), -1)
		if len(headings) == 0 {
			records = append(records, legacyRecord{"memdir-topic", file.Name(), string(data), storage.Hash(data)})
			continue
		}
		for n, h := range headings {
			end := len(data)
			if n+1 < len(headings) {
				end = headings[n+1][0]
			}
			summary := strings.TrimSpace(string(data[h[2]:h[3]]))
			detail := strings.TrimSpace(string(data[h[1]:end]))
			if strings.HasPrefix(detail, "_source:") {
				if at := strings.IndexByte(detail, '\n'); at >= 0 {
					detail = strings.TrimSpace(detail[at+1:])
				} else {
					detail = ""
				}
			}
			content := strings.TrimSpace(summary + "\n" + detail)
			topicBlocks[strings.TrimSuffix(file.Name(), ".md")+"\n"+summary] = content
			records = append(records, legacyRecord{"memdir-topic", fmt.Sprintf("%s:%d", file.Name(), n), content, storage.Hash(data[h[0]:end])})
		}
	}
	for n, record := range records {
		if record.System == "memdir-index" {
			if content := topicBlocks[indexTopics[record.ID]]; content != "" {
				records[n].Content = content
			}
		}
	}
	path := filepath.Join(profile, "chela-memory.db")
	if _, err = os.Stat(path); err == nil {
		legacy, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?mode=ro")
		if err != nil {
			return err
		}
		defer legacy.Close()
		rows, err := legacy.Query("SELECT id,content,embedding,COALESCE(metadata,'{}'),created_at FROM memories ORDER BY id")
		if err != nil {
			return err
		}
		for rows.Next() {
			var id int64
			var content, embedding, metadata, created string
			if err = rows.Scan(&id, &content, &embedding, &metadata, &created); err != nil {
				rows.Close()
				return err
			}
			raw, _ := json.Marshal([]any{id, content, embedding, metadata, created})
			records = append(records, legacyRecord{"legacy-vector", fmt.Sprint(id), content, storage.Hash(raw)})
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	assistant, err := store.Identity()
	if err != nil {
		return err
	}
	manifest, _ := json.Marshal(records)
	return store.Update(context.Background(), func(tx *sql.Tx) error {
		if err := tx.QueryRow("SELECT count(*) FROM import_receipts WHERE source='memory-legacy-v1'").Scan(&imported); err != nil || imported > 0 {
			return err
		}
		for _, record := range records {
			content := strings.TrimSpace(record.Content)
			if content == "" {
				continue
			}
			hash := storage.Hash([]byte(content))
			id := "legacy-memory-" + hash
			state := "pending"
			if credential.MatchString(content) {
				state = "sensitive"
				content = ""
			}
			source, _ := json.Marshal(map[string]string{"system": record.System, "id": record.ID, "hash": record.Hash})
			if _, err := tx.Exec(`INSERT INTO legacy_memory_candidates(candidate_id,assistant_id,content,content_hash,sources_json,state,created_at) VALUES(?,?,?,?,json_array(json(?)),?,?) ON CONFLICT(assistant_id,content_hash) DO UPDATE SET sources_json=json_insert(sources_json,'$[#]',json(?))`, id, assistant, content, hash, string(source), state, storage.Now(), string(source)); err != nil {
				return err
			}
			if _, err := tx.Exec("INSERT INTO legacy_import_map VALUES(?,?,?,'legacy_memory',?,?)", record.System, record.ID, record.Hash, id, storage.Now()); err != nil {
				return err
			}
		}
		_, err := tx.Exec("INSERT INTO import_receipts VALUES('memory-legacy-v1',?,?,?)", storage.Hash(manifest), len(records), storage.Now())
		return err
	})
}

func readLegacyFile(path string) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 2*1024*1024 {
		return nil, errors.New("旧记忆文件类型或大小异常")
	}
	return os.ReadFile(path)
}
