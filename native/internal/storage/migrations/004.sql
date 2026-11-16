ALTER TABLE sessions ADD COLUMN active_branch_id TEXT REFERENCES branches;
ALTER TABLE run_parameters ADD COLUMN handoff TEXT NOT NULL DEFAULT '';
