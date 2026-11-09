CREATE TABLE IF NOT EXISTS script_log_links (
  owner_id TEXT PRIMARY KEY NOT NULL,
  link_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS script_log_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  game TEXT NOT NULL,
  player TEXT NOT NULL,
  balance TEXT,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS script_log_sessions_owner_seen ON script_log_sessions(owner_id,last_seen_at);
CREATE TABLE IF NOT EXISTS script_log_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  game TEXT NOT NULL,
  player TEXT NOT NULL,
  item TEXT NOT NULL,
  balance TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(owner_id,event_id)
);
CREATE INDEX IF NOT EXISTS script_log_events_owner_cursor ON script_log_events(owner_id,id);
