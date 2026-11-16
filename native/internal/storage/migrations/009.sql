ALTER TABLE affect_events ADD COLUMN cluster_key TEXT NOT NULL DEFAULT '';
ALTER TABLE affect_events ADD COLUMN disposition TEXT NOT NULL DEFAULT 'applied';
CREATE INDEX affect_cluster ON affect_events(assistant_id,cluster_key,accepted_at);
CREATE TABLE run_expression_snapshots (
  run_id TEXT PRIMARY KEY REFERENCES runs,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json))
);
CREATE TABLE attention_reviews (
  run_id TEXT PRIMARY KEY REFERENCES runs,
  attention_id TEXT NOT NULL REFERENCES attention_items,
  attention_revision INTEGER NOT NULL,
  fact_fingerprint TEXT NOT NULL,
  source_refs_json TEXT NOT NULL CHECK(json_valid(source_refs_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX attention_review_fact ON attention_reviews(attention_id,attention_revision,fact_fingerprint);
