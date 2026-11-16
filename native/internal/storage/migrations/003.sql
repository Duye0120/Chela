ALTER TABLE run_parameters ADD COLUMN operation TEXT NOT NULL DEFAULT 'prompt' CHECK(operation IN ('prompt','compact'));
CREATE TABLE safe_cuts (
 token_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs, branch_id TEXT NOT NULL REFERENCES branches,
 generation INTEGER NOT NULL, base_revision INTEGER NOT NULL, erase_epoch INTEGER NOT NULL,
 first_kept_entry_id TEXT NOT NULL, cut_ordinal INTEGER NOT NULL, prefix_hash TEXT NOT NULL,
 sources_json TEXT NOT NULL CHECK(json_valid(sources_json)), created_at TEXT NOT NULL, consumed_at TEXT
);
