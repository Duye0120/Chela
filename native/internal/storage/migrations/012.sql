CREATE TABLE memory_encoders (
  generation TEXT PRIMARY KEY, assistant_id TEXT NOT NULL REFERENCES assistants,
  requested_model TEXT NOT NULL, gateway_url TEXT NOT NULL, actual_model TEXT NOT NULL DEFAULT '', dimension INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK(state IN ('building','active','retired')), created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_active_encoder ON memory_encoders(assistant_id) WHERE state='active';
CREATE UNIQUE INDEX one_building_encoder ON memory_encoders(assistant_id) WHERE state='building';
CREATE TABLE embedding_requests (
  request_id TEXT PRIMARY KEY, generation TEXT NOT NULL REFERENCES memory_encoders,
  purpose TEXT NOT NULL, status TEXT NOT NULL, input_tokens INTEGER, started_at TEXT NOT NULL, ended_at TEXT
);
