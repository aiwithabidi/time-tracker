import type { Database } from 'bun:sqlite'

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  client_name TEXT,
  hourly_rate REAL,
  currency TEXT DEFAULT 'USD',
  git_remote_url TEXT,
  directory_path TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  timezone TEXT NOT NULL,
  source TEXT NOT NULL,
  rate_at_time REAL,
  idle_deducted_ms INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_start ON sessions(project_id, start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON sessions(end_time);

CREATE TABLE IF NOT EXISTS session_terminals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  terminal_id TEXT NOT NULL,
  attached_at INTEGER NOT NULL,
  detached_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_session_terminals_session_terminal ON session_terminals(session_id, terminal_id);

CREATE TABLE IF NOT EXISTS session_notes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_tags (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  tag TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_tags_session_tag ON session_tags(session_id, tag);

CREATE TABLE IF NOT EXISTS activity_pulses (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  terminal_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_pulses_session_timestamp ON activity_pulses(session_id, timestamp);
`

const MIGRATIONS_SQL = [
  `ALTER TABLE sessions ADD COLUMN paused_at INTEGER;`,
  `CREATE TABLE IF NOT EXISTS undo_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`,
]

export function ensureSchema(sqlite: Database): void {
  sqlite.exec(CREATE_TABLES_SQL)

  for (const migration of MIGRATIONS_SQL) {
    try {
      sqlite.exec(migration)
    } catch {
      // Column may already exist on re-run — safe to ignore
    }
  }
}
