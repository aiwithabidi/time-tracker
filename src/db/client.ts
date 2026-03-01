import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import * as schema from './schema'
import { ensureSchema } from './migrate'

const DB_DIR = path.join(os.homedir(), '.tt')
const DB_PATH = path.join(DB_DIR, 'tt.db')

type DbInstance = BunSQLiteDatabase<typeof schema>

let dbInstance: DbInstance | null = null
let sqliteInstance: Database | null = null

function initializeDatabase(): { db: DbInstance; sqlite: Database } {
  fs.mkdirSync(DB_DIR, { recursive: true })
  fs.chmodSync(DB_DIR, 0o700)

  const sqlite = new Database(DB_PATH, { create: true })
  fs.chmodSync(DB_PATH, 0o600)

  // busy_timeout MUST be first — all subsequent PRAGMAs need it for lock retry
  sqlite.exec('PRAGMA busy_timeout = 5000')
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA synchronous = NORMAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec('PRAGMA cache_size = -32000')
  sqlite.exec('PRAGMA journal_size_limit = 67108864') // 64MB WAL limit

  const db = drizzle(sqlite, { schema })

  sqliteInstance = sqlite
  dbInstance = db

  ensureSchema(sqlite)

  return { db, sqlite }
}

export function getDb(): DbInstance {
  if (!dbInstance) {
    initializeDatabase()
  }
  return dbInstance!
}

export function getSqlite(): Database {
  if (!sqliteInstance) {
    initializeDatabase()
  }
  return sqliteInstance!
}

export function withTransaction<T>(fn: () => T): T {
  getDb() // ensure initialized
  const sqlite = getSqlite()

  sqlite.exec('BEGIN DEFERRED')
  try {
    const result = fn()
    sqlite.exec('COMMIT')
    return result
  } catch (error) {
    sqlite.exec('ROLLBACK')
    throw error
  }
}

export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close()
    sqliteInstance = null
    dbInstance = null
  }
}

// Ensure clean WAL checkpointing on process exit
process.on('exit', () => closeDb())
