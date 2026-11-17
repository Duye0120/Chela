package chat

import (
	"strings"
	"time"
)

type ToolActivity struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Arguments    string `json:"arguments"`
	State        string `json:"state"`
	Result       string `json:"result,omitempty"`
	Milliseconds int64  `json:"milliseconds,omitempty"`
}

func fillToolActivity(db queryer, session *ChatSession) error {
	targets := map[string]*ToolActivity{}
	ids := []string{}
	for i := range session.Messages {
		for j := range session.Messages[i].Tools {
			tool := &session.Messages[i].Tools[j]
			targets[tool.ID] = tool
			ids = append(ids, tool.ID)
		}
	}
	for start := 0; start < len(ids); start += 500 {
		end := min(start+500, len(ids))
		args := []any{session.ID}
		for _, id := range ids[start:end] {
			args = append(args, id)
		}
		rows, err := db.Query(`SELECT t.invocation_id,t.state,substr(COALESCE(t.result_json,''),1,4096),COALESCE(t.started_at,t.created_at),COALESCE(t.ended_at,'') FROM tool_invocations t JOIN runs r ON r.run_id=t.run_id WHERE r.session_id=? AND t.invocation_id IN (`+strings.TrimSuffix(strings.Repeat("?,", end-start), ",")+`)`, args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id, state, result, begin, finish string
			if err = rows.Scan(&id, &state, &result, &begin, &finish); err != nil {
				rows.Close()
				return err
			}
			if tool := targets[id]; tool != nil {
				tool.State = state
				tool.Result = result
				a, e1 := time.Parse(time.RFC3339Nano, begin)
				b, e2 := time.Parse(time.RFC3339Nano, finish)
				if e1 == nil && e2 == nil {
					tool.Milliseconds = max(0, b.Sub(a).Milliseconds())
				}
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
	}
	return nil
}
