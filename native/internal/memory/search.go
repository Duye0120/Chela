package memory

import (
	"database/sql"
	"strings"
	"unicode"

	"github.com/Duye0120/Chela/native/internal/storage"
)

// Tokens keeps identifiers and adds Han bigrams, including two-character queries.
func Tokens(text string) string {
	var tokens []string
	var latin, han []rune
	flush := func() {
		if len(latin) > 0 {
			tokens = append(tokens, string(latin))
			latin = nil
		}
		for i := 0; i+1 < len(han); i++ {
			tokens = append(tokens, string(han[i:i+2]))
		}
		han = nil
	}
	for _, r := range strings.ToLower(text) {
		if unicode.Is(unicode.Han, r) {
			if len(latin) > 0 {
				flush()
			}
			han = append(han, r)
		} else if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' {
			if len(han) > 0 {
				flush()
			}
			latin = append(latin, r)
		} else {
			flush()
		}
	}
	flush()
	return strings.Join(tokens, " ")
}

func Retrieve(tx *sql.Tx, assistant string, scopes []Scope, query string, includeCandidates bool) ([]Item, error) {
	where := []string{}
	args := []any{assistant}
	for _, scope := range scopes {
		where = append(where, "(m.scope_type=? AND m.scope_id=?)")
		args = append(args, scope.Type, scope.ID)
	}
	if len(where) == 0 {
		return []Item{}, nil
	}
	filter := " m.assistant_id=? AND (" + strings.Join(where, " OR ") + ") AND m.status IN ('active','disputed') AND m.valid_from<=? AND (m.valid_until IS NULL OR m.valid_until>?)"
	if includeCandidates {
		filter = strings.Replace(filter, "('active','disputed')", "('active','disputed','candidate')", 1)
	}
	now := storage.Now()
	args = append(args, now, now)
	query = strings.TrimSpace(query)
	if query != "" {
		exactArgs := append(append([]any{}, args...), query, query, query)
		rows, err := tx.Query(itemSelect+" WHERE "+filter+" AND (m.memory_id=? OR m.subject_id=? OR m.slot_key=?) ORDER BY r.recorded_at DESC LIMIT 40", exactArgs...)
		if err != nil {
			return nil, err
		}
		items := []Item{}
		for rows.Next() {
			i, err := scan(rows)
			if err != nil {
				rows.Close()
				return nil, err
			}
			items = append(items, i)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
		if len(items) > 0 {
			return items, nil
		}
	}
	selectSQL, order, limit := itemSelect, "r.recorded_at DESC", "100"
	tokens := strings.Fields(Tokens(query))
	if len(tokens) > 24 {
		tokens = tokens[:24]
	}
	if query != "" && len(tokens) > 0 {
		for i, t := range tokens {
			tokens[i] = "\"" + strings.ReplaceAll(t, "\"", "\"\"") + "\""
		}
		selectSQL += " JOIN memory_search ms ON ms.memory_id=m.memory_id JOIN memory_fts ON memory_fts.rowid=ms.search_id"
		filter += " AND memory_fts MATCH ?"
		order, limit = "bm25(memory_fts),r.recorded_at DESC", "40"
		args = append(args, strings.Join(tokens, " OR "))
	} else if query != "" {
		selectSQL = "SELECT * FROM (" + selectSQL + " WHERE " + filter + " ORDER BY r.recorded_at DESC LIMIT 100) bounded WHERE instr(content,?)>0"
		args = append(args, query)
		rows, err := tx.Query(selectSQL, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		items := []Item{}
		for rows.Next() {
			i, err := scan(rows)
			if err != nil {
				return nil, err
			}
			items = append(items, i)
		}
		return items, rows.Err()
	}
	rows, err := tx.Query(selectSQL+" WHERE "+filter+" ORDER BY "+order+" LIMIT "+limit, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Item{}
	for rows.Next() {
		i, err := scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, rows.Err()
}
