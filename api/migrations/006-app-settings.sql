-- App-level key/value settings.
-- Values are JSON strings owned by feature-specific API endpoints.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
