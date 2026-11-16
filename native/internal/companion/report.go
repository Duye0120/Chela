package companion

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type reportResult struct {
	Terminal string `json:"terminalSessionId"`
	Ref      string `json:"resultRef"`
	Version  int64  `json:"resultVersion"`
	Title    string `json:"title"`
}

func reportSnapshot(tx *sql.Tx, assistant string, now time.Time, loc *time.Location) (string, []byte, error) {
	local := now.In(loc)
	start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	end := start.AddDate(0, 0, 1)
	yesterday := start.AddDate(0, 0, -1)
	date := start.Format(time.DateOnly)
	groups := []struct {
		key, title, filter string
		args               []any
	}{
		{"completed", "昨天完成", `p.kind='task' AND p.status='done' AND p.completed_at>=? AND p.completed_at<?`, []any{stamp(yesterday), stamp(start)}},
		{"leftover", "昨天遗留", `p.kind='task' AND p.status NOT IN ('done','cancelled') AND EXISTS(SELECT 1 FROM schedule_blocks b WHERE b.item_id=p.item_id AND b.start_at<? AND b.end_at>?)`, []any{stamp(start), stamp(yesterday)}},
		{"today", "今天安排", `p.status NOT IN ('done','cancelled') AND (p.due_date<=? OR p.due_at<? OR EXISTS(SELECT 1 FROM schedule_blocks b WHERE b.item_id=p.item_id AND b.start_at<? AND b.end_at>?))`, []any{date, stamp(end), stamp(end), stamp(start)}},
	}
	facts := map[string]any{"captured_at": stamp(now)}
	lines := []string{date + " · 晨报"}
	for _, group := range groups {
		args := append([]any{assistant}, group.args...)
		rows, err := tx.Query(`SELECT p.item_id,p.revision,p.title,p.status,COALESCE(p.due_date,''),COALESCE(p.due_at,''),COALESCE(p.timezone,'UTC'),COALESCE(p.project_id,'') FROM planner_items p WHERE p.assistant_id=? AND p.deleted_at IS NULL AND p.kind<>'note' AND `+group.filter+` ORDER BY p.item_id LIMIT 101`, args...)
		if err != nil {
			return "", nil, err
		}
		items := []Fact{}
		for rows.Next() {
			var f Fact
			if err = rows.Scan(&f.ID, &f.Revision, &f.Title, &f.Status, &f.DueDate, &f.DueAt, &f.Timezone, &f.Project); err != nil {
				rows.Close()
				return "", nil, err
			}
			items = append(items, f)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return "", nil, err
		}
		more := len(items) > 100
		if more {
			items = items[:100]
		}
		facts[group.key] = items
		lines = append(lines, group.title)
		if len(items) == 0 {
			lines = append(lines, "• 暂无")
		}
		for _, f := range items {
			due := ""
			if group.key == "today" {
				if f.DueDate != "" {
					due = "（期限 " + f.DueDate + "）"
				} else if f.DueAt != "" {
					instant, err := time.Parse(time.RFC3339Nano, f.DueAt)
					if err != nil {
						return "", nil, err
					}
					due = "（期限 " + instant.In(loc).Format("01-02 15:04") + "）"
				}
			}
			lines = append(lines, "• "+f.Title+due)
		}
		if more {
			lines = append(lines, "• 还有更多事项，请打开工作区查看。")
		}
	}
	rows, err := tx.Query(`SELECT o.terminal_session_id,o.result_ref,o.result_version,COALESCE(p.title,s.executor_kind) FROM execution_observations o JOIN terminal_sessions s ON s.terminal_session_id=o.terminal_session_id LEFT JOIN execution_links l ON l.terminal_session_id=s.terminal_session_id LEFT JOIN planner_items p ON p.item_id=l.item_id AND p.deleted_at IS NULL WHERE s.assistant_id=? AND o.kind='reply_available' AND o.result_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM execution_observations seen WHERE seen.terminal_session_id=o.terminal_session_id AND seen.result_ref=o.result_ref AND seen.result_version=o.result_version AND seen.kind IN ('reply_seen','handled')) ORDER BY o.observed_at DESC LIMIT 100`, assistant)
	if err != nil {
		return "", nil, err
	}
	results := []reportResult{}
	for rows.Next() {
		var r reportResult
		if err = rows.Scan(&r.Terminal, &r.Ref, &r.Version, &r.Title); err != nil {
			rows.Close()
			return "", nil, err
		}
		results = append(results, r)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return "", nil, err
	}
	facts["cliResults"] = results
	lines = append(lines, fmt.Sprintf("CLI 新结果待查看（%d）", len(results)))
	for _, r := range results {
		lines = append(lines, "• "+r.Title)
	}
	raw, err := json.Marshal(facts)
	return strings.Join(lines, "\n"), raw, err
}
