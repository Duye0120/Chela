ALTER TABLE planner_items ADD COLUMN deleted_at TEXT;
CREATE INDEX planner_live ON planner_items(assistant_id,kind,deleted_at);
