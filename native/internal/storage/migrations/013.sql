CREATE TABLE legacy_memory_candidates (
  candidate_id TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  content TEXT, content_hash TEXT NOT NULL, sources_json TEXT NOT NULL CHECK(json_valid(sources_json)),
  state TEXT NOT NULL CHECK(state IN ('pending','accepted','dismissed','sensitive','erased')),
  memory_id TEXT REFERENCES memories, created_at TEXT NOT NULL,
  UNIQUE(assistant_id,content_hash)
);
