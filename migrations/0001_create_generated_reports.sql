CREATE TABLE IF NOT EXISTS generated_reports (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_reports_type_created_at
  ON generated_reports (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_reports_created_at
  ON generated_reports (created_at DESC);
