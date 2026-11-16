CREATE TABLE presentations (
  presentation_id TEXT PRIMARY KEY,
  assistant_id TEXT NOT NULL REFERENCES assistants,
  emotion TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('active','ended')),
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  ended_at TEXT
);
CREATE UNIQUE INDEX presentation_active ON presentations(assistant_id) WHERE state='active';
CREATE TABLE presentation_deliveries (
  presentation_id TEXT NOT NULL REFERENCES presentations,
  delivery_id TEXT NOT NULL REFERENCES deliveries,
  PRIMARY KEY(presentation_id,delivery_id)
);
CREATE INDEX presentation_delivery ON presentation_deliveries(delivery_id);
