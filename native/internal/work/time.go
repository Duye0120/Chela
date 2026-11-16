package work

import (
	"errors"
	"time"
)

// Reject DST gaps and folds instead of silently moving a user-entered deadline.
func resolveLocalTime(value, zone string) (time.Time, error) {
	wall, err := time.Parse("2006-01-02T15:04", value)
	if err != nil {
		return time.Time{}, errors.New("日期时间格式无效")
	}
	location, err := time.LoadLocation(zone)
	if err != nil {
		return time.Time{}, errors.New("请选择有效的时区")
	}
	var result time.Time
	seen := map[int]bool{}
	for _, hours := range []int{-48, -24, 0, 24, 48} {
		_, offset := wall.Add(time.Duration(hours) * time.Hour).In(location).Zone()
		if seen[offset] {
			continue
		}
		seen[offset] = true
		candidate := wall.Add(-time.Duration(offset) * time.Second)
		if candidate.In(location).Format("2006-01-02T15:04") == value {
			if !result.IsZero() {
				return time.Time{}, errors.New("此时间在夏令时切换中重复，请选择其他时间")
			}
			result = candidate
		}
	}
	if result.IsZero() {
		return result, errors.New("此时间在所选时区不存在，请选择其他时间")
	}
	return result, nil
}
