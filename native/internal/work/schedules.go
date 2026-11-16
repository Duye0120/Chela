package work

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type ScheduleBlock struct {
	ID             string `json:"id"`
	Revision       int64  `json:"revision"`
	StartAt        string `json:"startAt"`
	EndAt          string `json:"endAt"`
	LocalStart     string `json:"localStart"`
	LocalEnd       string `json:"localEnd"`
	Timezone       string `json:"timezone"`
	Binding        string `json:"binding"`
	AllDay         bool   `json:"allDay"`
	Locked         bool   `json:"locked"`
	EstimateSource string `json:"estimateSource"`
}

func normalizeBlock(b *ScheduleBlock) error {
	location, err := time.LoadLocation(b.Timezone)
	if err != nil || b.Timezone == "" {
		return errors.New("时间块需要有效的 IANA 时区")
	}
	if b.Binding == "" {
		b.Binding = "floating_local"
	}
	var start, end time.Time
	switch b.Binding {
	case "absolute_instant":
		if b.AllDay {
			return errors.New("全天排期不能绑定绝对时刻")
		}
		start, err = time.Parse(time.RFC3339, b.StartAt)
		if err == nil {
			end, err = time.Parse(time.RFC3339, b.EndAt)
		}
		if err == nil {
			b.LocalStart = start.In(location).Format("2006-01-02T15:04")
			b.LocalEnd = end.In(location).Format("2006-01-02T15:04")
		}
	case "floating_local", "zoned_local":
		if b.AllDay {
			start, err = time.ParseInLocation(time.DateOnly, b.LocalStart, location)
			if err == nil {
				end, err = time.ParseInLocation(time.DateOnly, b.LocalEnd, location)
			}
			if err == nil && (start.Format(time.DateOnly) != b.LocalStart || end.Format(time.DateOnly) != b.LocalEnd) {
				err = errors.New("所选日期在此时区不存在")
			}
		} else {
			start, err = resolveLocalTime(b.LocalStart, b.Timezone)
			if err == nil {
				end, err = resolveLocalTime(b.LocalEnd, b.Timezone)
			}
		}
	default:
		return errors.New("时间绑定方式无效")
	}
	if err != nil {
		return err
	}
	if !end.After(start) {
		return errors.New("时间块结束必须晚于开始")
	}
	if b.EstimateSource != "" && b.EstimateSource != "model" && b.EstimateSource != "user" {
		return errors.New("估时来源无效")
	}
	b.StartAt, b.EndAt = utc(start), utc(end)
	return nil
}

func readBlocks(tx *sql.Tx, item string) ([]ScheduleBlock, error) {
	rows, err := tx.Query(`SELECT block_id,revision,start_at,end_at,COALESCE(local_start,''),COALESCE(local_end,''),timezone,time_binding,all_day,locked,COALESCE(estimate_source,'') FROM schedule_blocks WHERE item_id=? ORDER BY start_at,block_id`, item)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	blocks := []ScheduleBlock{}
	for rows.Next() {
		var b ScheduleBlock
		if err = rows.Scan(&b.ID, &b.Revision, &b.StartAt, &b.EndAt, &b.LocalStart, &b.LocalEnd, &b.Timezone, &b.Binding, &b.AllDay, &b.Locked, &b.EstimateSource); err != nil {
			return nil, err
		}
		blocks = append(blocks, b)
	}
	return blocks, rows.Err()
}

func sameBlock(a, b ScheduleBlock) bool {
	a.ID, b.ID = "", ""
	a.Revision, b.Revision = 0, 0
	return a == b
}

func writeBlocks(tx *sql.Tx, item string, desired []ScheduleBlock, plan bool) ([]ScheduleBlock, error) {
	if len(desired) > 80 {
		return nil, errors.New("一个事项最多安排 80 个时间块")
	}
	old, err := readBlocks(tx, item)
	if err != nil {
		return nil, err
	}
	byID := map[string]ScheduleBlock{}
	for _, b := range old {
		byID[b.ID] = b
	}
	seen := map[string]bool{}
	for i := range desired {
		b := &desired[i]
		if err = normalizeBlock(b); err != nil {
			return nil, err
		}
		if b.ID == "" {
			b.ID = rand.Text()
		} else if _, ok := byID[b.ID]; !ok && b.ID != "schedule-"+item {
			return nil, errors.New("时间块已不存在或属于其他事项")
		}
		if seen[b.ID] {
			return nil, errors.New("时间块 ID 重复")
		}
		seen[b.ID] = true
		previous, exists := byID[b.ID]
		if exists {
			if b.Revision != previous.Revision {
				return nil, errors.New("时间块已改变，请重新加载")
			}
			if sameBlock(previous, *b) {
				continue
			}
			unlocked := previous
			unlocked.Locked = false
			if previous.Locked && (plan || !sameBlock(unlocked, *b)) {
				return nil, errors.New("请先解锁并保存，再移动或删除时间块")
			}
		}
		b.Revision = previous.Revision + 1
		_, err = tx.Exec(`INSERT INTO schedule_blocks(block_id,item_id,revision,start_at,end_at,local_start,local_end,timezone,time_binding,all_day,locked,estimate_source) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULLIF(?,'')) ON CONFLICT(block_id) DO UPDATE SET revision=excluded.revision,start_at=excluded.start_at,end_at=excluded.end_at,local_start=excluded.local_start,local_end=excluded.local_end,timezone=excluded.timezone,time_binding=excluded.time_binding,all_day=excluded.all_day,locked=excluded.locked,estimate_source=excluded.estimate_source`, b.ID, item, b.Revision, b.StartAt, b.EndAt, b.LocalStart, b.LocalEnd, b.Timezone, b.Binding, b.AllDay, b.Locked, b.EstimateSource)
		if err != nil {
			return nil, err
		}
	}
	for _, b := range old {
		if !seen[b.ID] {
			if b.Locked {
				return nil, errors.New("锁定的时间块不能删除")
			}
			if _, err = tx.Exec("DELETE FROM schedule_blocks WHERE block_id=?", b.ID); err != nil {
				return nil, err
			}
		}
	}
	return desired, nil
}

func taskBlocks(tx *sql.Tx, task WorkTask) ([]ScheduleBlock, error) {
	old, err := readBlocks(tx, task.ID)
	if err != nil {
		return nil, err
	}
	blocks := append([]ScheduleBlock{}, task.Blocks...)
	if task.Blocks == nil {
		for _, b := range old {
			if b.ID != "schedule-"+task.ID {
				blocks = append(blocks, b)
			}
		}
	}
	if task.Date != "" {
		end := task.Date
		if task.EndDate != "" {
			end = task.EndDate
		}
		day, err := time.Parse(time.DateOnly, end)
		if err != nil {
			return nil, err
		}
		primary := ScheduleBlock{ID: "schedule-" + task.ID, LocalStart: task.Date, LocalEnd: day.AddDate(0, 0, 1).Format(time.DateOnly), Timezone: task.Timezone, Binding: "floating_local", AllDay: true}
		for _, b := range old {
			if b.ID == primary.ID {
				primary.Revision = b.Revision
				primary.Locked = b.Locked
				primary.EstimateSource = b.EstimateSource
			}
		}
		blocks = append(blocks, primary)
	}
	for _, b := range task.Blocks {
		if strings.HasPrefix(b.ID, "schedule-") {
			return nil, fmt.Errorf("主排期请通过开始、结束日期调整")
		}
	}
	return blocks, nil
}
