ALTER TABLE plan_drafts ADD COLUMN origin_session_id TEXT REFERENCES sessions;
