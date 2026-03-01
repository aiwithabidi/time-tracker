import type { Database } from 'bun:sqlite'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// Bump this number whenever CREATE_TABLES_SQL or MIGRATIONS_SQL changes.
// ensureSchema() will skip all DDL when the on-disk version matches.
const SCHEMA_VERSION = 2

const VERSION_FILE = path.join(os.homedir(), '.tt', 'schema-version')

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
  `CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  audience TEXT NOT NULL,
  content TEXT NOT NULL,
  raw_data_json TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  total_ms INTEGER NOT NULL,
  spread_days INTEGER,
  project_id TEXT REFERENCES projects(id),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_period ON reviews(period_start, period_end);`,
  `CREATE TABLE IF NOT EXISTS review_sessions (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id),
  session_id TEXT NOT NULL REFERENCES sessions(id)
);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_review_sessions_review_session ON review_sessions(review_id, session_id);`,
  `CREATE TABLE IF NOT EXISTS review_git_commits (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id),
  hash TEXT NOT NULL,
  short_hash TEXT NOT NULL,
  author TEXT NOT NULL,
  date INTEGER NOT NULL,
  message TEXT NOT NULL,
  repository_path TEXT NOT NULL,
  files_changed INTEGER,
  insertions INTEGER,
  deletions INTEGER
);`,
  `CREATE INDEX IF NOT EXISTS idx_review_git_commits_review ON review_git_commits(review_id);`,
  `CREATE INDEX IF NOT EXISTS idx_activity_pulses_terminal_timestamp ON activity_pulses(terminal_id, timestamp);`,
  `CREATE TABLE IF NOT EXISTS command_events (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  subcommand TEXT,
  args TEXT,
  duration_ms INTEGER,
  success INTEGER NOT NULL,
  error_message TEXT,
  error_type TEXT,
  project_slug TEXT,
  session_id TEXT,
  cwd TEXT,
  timestamp INTEGER NOT NULL
);`,
  `CREATE INDEX IF NOT EXISTS idx_command_events_timestamp ON command_events(timestamp);`,
  `CREATE INDEX IF NOT EXISTS idx_command_events_command ON command_events(command);`,
]

function readSchemaVersion(): number {
  try {
    const content = fs.readFileSync(VERSION_FILE, 'utf-8').trim()
    const version = parseInt(content, 10)
    return Number.isNaN(version) ? 0 : version
  } catch {
    return 0
  }
}

function writeSchemaVersion(): void {
  try {
    fs.writeFileSync(VERSION_FILE, String(SCHEMA_VERSION), 'utf-8')
  } catch {
    // Non-critical — next run will just re-apply migrations
  }
}

export function ensureSchema(sqlite: Database): void {
  // Skip DDL entirely when schema is already at current version.
  // This eliminates exclusive locks from DDL on every process start.
  if (readSchemaVersion() >= SCHEMA_VERSION) {
    return
  }

  sqlite.exec(CREATE_TABLES_SQL)

  for (const migration of MIGRATIONS_SQL) {
    try {
      sqlite.exec(migration)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('already exists') && !message.includes('duplicate column name')) {
        throw err
      }
    }
  }

  writeSchemaVersion()
}
