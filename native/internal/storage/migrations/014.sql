ALTER TABLE terminal_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'terminal';
ALTER TABLE terminal_sessions ADD COLUMN generation INTEGER NOT NULL DEFAULT 1;
CREATE TABLE executor_events (
  terminal_session_id TEXT NOT NULL REFERENCES terminal_sessions,
  generation INTEGER NOT NULL, sequence INTEGER NOT NULL,
  evidence_format TEXT NOT NULL, payload_json TEXT NOT NULL,
  observed_at TEXT NOT NULL, PRIMARY KEY(terminal_session_id,generation,sequence)
);
