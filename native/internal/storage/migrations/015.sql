CREATE TABLE run_capabilities (
  attempt_id TEXT PRIMARY KEY REFERENCES run_attempts,
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
  manifest_hash TEXT NOT NULL,
  tools_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tools_json))
);
CREATE TABLE extension_ui_requests (
  request_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES run_attempts,
  session_id TEXT NOT NULL REFERENCES sessions,
  run_id TEXT NOT NULL REFERENCES runs,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  state TEXT NOT NULL CHECK(state IN ('pending','answered','cancelled','expired','notified')),
  answer_json TEXT CHECK(answer_json IS NULL OR json_valid(answer_json)),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX extension_ui_session ON extension_ui_requests(session_id,state,created_at);
