ALTER TABLE safe_cuts ADD COLUMN purpose TEXT NOT NULL DEFAULT 'compact' CHECK(purpose IN ('compact','rebuild'));
