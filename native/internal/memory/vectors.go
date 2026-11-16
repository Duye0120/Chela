package memory

import (
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"sort"
	"strings"

	"github.com/Duye0120/Chela/native/internal/storage"
)

type QueryVector struct {
	Generation string
	Model      string
	Values     []float64
}

func ValidateVector(values []float64) error {
	if len(values) == 0 || len(values) > 16384 {
		return errors.New("向量维度无效")
	}
	var norm float64
	for _, v := range values {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New("向量含非有限数值")
		}
		norm += v * v
	}
	if norm == 0 || math.IsInf(norm, 0) {
		return errors.New("向量长度无效")
	}
	return nil
}

// Fuse only reads allowed current revisions; stale vectors never reach the prompt.
func Fuse(tx *sql.Tx, assistant string, scopes []Scope, lexical []Item, query *QueryVector) ([]Item, error) {
	if query == nil {
		return lexical, nil
	}
	var active int
	if err := tx.QueryRow("SELECT count(*) FROM memory_encoders WHERE assistant_id=? AND generation=? AND actual_model=? AND dimension=? AND state='active'", assistant, query.Generation, query.Model, len(query.Values)).Scan(&active); err != nil {
		return nil, err
	}
	if active == 0 {
		return lexical, nil
	}
	where := []string{}
	args := []any{query.Model, query.Generation, len(query.Values), assistant}
	for _, scope := range scopes {
		where = append(where, "(m.scope_type=? AND m.scope_id=?)")
		args = append(args, scope.Type, scope.ID)
	}
	if len(where) == 0 {
		return []Item{}, nil
	}
	now := storage.Now()
	args = append(args, now, now)
	rows, err := tx.Query(`SELECT m.memory_id,e.vector FROM memories m JOIN embeddings e ON e.memory_id=m.memory_id AND e.memory_revision=m.current_revision WHERE e.encoder_id=? AND e.encoder_revision=? AND e.dimension=? AND m.assistant_id=? AND (`+strings.Join(where, " OR ")+`) AND m.status IN ('active','disputed') AND m.valid_from<=? AND (m.valid_until IS NULL OR m.valid_until>?)`, args...)
	if err != nil {
		return nil, err
	}
	type hit struct {
		id    string
		score float64
	}
	var hits []hit
	var queryNorm float64
	for _, v := range query.Values {
		queryNorm += v * v
	}
	for rows.Next() {
		var id string
		var raw []byte
		if err = rows.Scan(&id, &raw); err != nil {
			rows.Close()
			return nil, err
		}
		var values []float64
		if json.Unmarshal(raw, &values) != nil || len(values) != len(query.Values) || ValidateVector(values) != nil {
			continue
		}
		var dot, norm float64
		for i, v := range values {
			dot += v * query.Values[i]
			norm += v * v
		}
		score := dot / math.Sqrt(norm*queryNorm)
		if score >= .5 {
			hits = append(hits, hit{id, score})
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].score > hits[j].score })
	if len(hits) > 40 {
		hits = hits[:40]
	}
	ranks := map[string]float64{}
	items := map[string]Item{}
	for i, item := range lexical {
		if i >= 40 {
			break
		}
		ranks[item.ID] += 1 / float64(61+i)
		items[item.ID] = item
	}
	for i, hit := range hits {
		item, err := Get(tx, hit.id)
		if err != nil {
			return nil, err
		}
		ranks[item.ID] += 1 / float64(61+i)
		items[item.ID] = item
	}
	ids := make([]string, 0, len(ranks))
	for id := range ranks {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		if ranks[ids[i]] == ranks[ids[j]] {
			return ids[i] < ids[j]
		}
		return ranks[ids[i]] > ranks[ids[j]]
	})
	if len(ids) > 20 {
		ids = ids[:20]
	}
	result := make([]Item, 0, len(ids))
	for _, id := range ids {
		result = append(result, items[id])
	}
	return result, nil
}
