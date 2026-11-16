ALTER TABLE terminal_sessions ADD COLUMN exit_code INTEGER;
CREATE TABLE terminal_output (
  terminal_session_id TEXT PRIMARY KEY REFERENCES terminal_sessions,
  next_offset INTEGER NOT NULL,
  output BLOB NOT NULL,
  updated_at TEXT NOT NULL
);
