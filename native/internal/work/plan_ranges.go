package work

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func changeBlocks(c PlanChange) ([]ScheduleBlock, error) {
	blocks := append([]ScheduleBlock{}, c.Blocks...)
	if c.Blocks == nil {
		end := c.Date
		if c.EndDate != "" {
			end = c.EndDate
		}
		day, err := time.Parse(time.DateOnly, end)
		if err != nil {
			return nil, errors.New("计划日期无效")
		}
		b := ScheduleBlock{LocalStart: c.Date, LocalEnd: day.AddDate(0, 0, 1).Format(time.DateOnly), Timezone: c.Timezone, AllDay: true}
		if c.ItemID != "" {
			b.ID = "schedule-" + c.ItemID
		}
		blocks = append(blocks, b)
	}
	if len(blocks) == 0 || len(blocks) > 80 {
		return nil, errors.New("每项计划需要 1–80 个时间块")
	}
	for i := range blocks {
		if err := normalizeBlock(&blocks[i]); err != nil {
			return nil, err
		}
	}
	return blocks, nil
}

func effectivePlanBlocks(tx *sql.Tx, c PlanChange) ([]ScheduleBlock, error) {
	blocks, err := changeBlocks(c)
	if err != nil {
		return nil, err
	}
	if c.Blocks == nil && c.ItemID != "" {
		old, err := readBlocks(tx, c.ItemID)
		if err != nil {
			return nil, err
		}
		for _, b := range old {
			if b.ID == "schedule-"+c.ItemID {
				blocks[0].Revision = b.Revision
				blocks[0].Locked = b.Locked
				blocks[0].EstimateSource = b.EstimateSource
			} else {
				blocks = append(blocks, b)
			}
		}
	}
	return blocks, nil
}

func planConflicts(tx *sql.Tx, p PlanDraft) ([]string, error) {
	type occupied struct {
		item, title string
		block       ScheduleBlock
	}
	changes := map[string]bool{}
	var proposed []occupied
	for _, c := range p.Changes {
		if c.ItemID != "" {
			changes[c.ItemID] = true
		}
		title := c.Title
		if c.ItemID != "" {
			if err := tx.QueryRow("SELECT title FROM planner_items WHERE item_id=?", c.ItemID).Scan(&title); err != nil {
				return nil, err
			}
		}
		blocks, err := effectivePlanBlocks(tx, c)
		if err != nil {
			return nil, err
		}
		for _, b := range blocks {
			proposed = append(proposed, occupied{c.ItemID, title, b})
		}
	}
	conflicts := []string{}
	for i, a := range proposed {
		// Date-only tasks are day buckets; meetings and locked blocks occupy time.
		if a.block.AllDay {
			continue
		}
		for _, b := range proposed[:i] {
			if !b.block.AllDay && a.block.StartAt < b.block.EndAt && a.block.EndAt > b.block.StartAt {
				conflicts = append(conflicts, fmt.Sprintf("%s 与 %s 重叠（%s — %s %s）", a.title, b.title, a.block.LocalStart, a.block.LocalEnd, a.block.Timezone))
			}
		}
		rows, err := tx.Query(`SELECT p.item_id,p.title,b.local_start,b.local_end,b.timezone FROM schedule_blocks b JOIN planner_items p ON p.item_id=b.item_id WHERE p.deleted_at IS NULL AND p.status NOT IN ('done','cancelled') AND (b.all_day=0 OR b.locked=1 OR p.kind='calendar_event') AND b.start_at<? AND b.end_at>?`, a.block.EndAt, a.block.StartAt)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var item, title, start, end, zone string
			if err = rows.Scan(&item, &title, &start, &end, &zone); err != nil {
				rows.Close()
				return nil, err
			}
			if !changes[item] {
				conflicts = append(conflicts, fmt.Sprintf("%s 与已有 %s 重叠（%s — %s %s）", a.title, title, start, end, zone))
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}
	return conflicts, nil
}
