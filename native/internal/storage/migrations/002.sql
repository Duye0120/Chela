-- Existing workspace presentation fields and persisted execution selection.
ALTER TABLE sessions ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1));
ALTER TABLE sessions ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN model_id TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN effort TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN deleted_at TEXT;
CREATE TABLE run_parameters (
  run_id TEXT PRIMARY KEY REFERENCES runs,
  model_id TEXT NOT NULL, effort TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT ''
);
CREATE TABLE import_receipts (
  source TEXT PRIMARY KEY, source_hash TEXT NOT NULL,
  imported_count INTEGER NOT NULL, imported_at TEXT NOT NULL
);
