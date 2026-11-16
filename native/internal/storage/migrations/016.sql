CREATE TABLE mcp_connections (
  connection_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  project_path TEXT NOT NULL DEFAULT '',
  config_blob BLOB NOT NULL,
  config_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  health TEXT NOT NULL DEFAULT 'disabled',
  last_error TEXT NOT NULL DEFAULT '',
  catalog_json TEXT NOT NULL DEFAULT '{"tools":[]}' CHECK(json_valid(catalog_json)),
  updated_at TEXT NOT NULL
);
CREATE TABLE run_mcp_tools (
  attempt_id TEXT NOT NULL REFERENCES run_attempts,
  tool_name TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  connection_revision INTEGER NOT NULL,
  tool_version TEXT NOT NULL,
  definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
  PRIMARY KEY(attempt_id,tool_name)
);
