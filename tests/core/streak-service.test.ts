import { describe, expect, it, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import { createRepositories } from '../../src/db/repositories/index'
import { createStreakService } from '../../src/core/reports/streak-service'
import { DateTime } from 'luxon'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')

  // Apply schema directly for in-memory DB (ensureSchema checks a version file
  // on disk and may skip DDL if the on-disk schema is already current).
  sqlite.exec(`
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
      paused_at INTEGER,
      idle_deducted_ms INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_terminals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      terminal_id TEXT NOT NULL,
      attached_at INTEGER NOT NULL,
      detached_at INTEGER
    );
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
    CREATE TABLE IF NOT EXISTS activity_pulses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      terminal_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS undo_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
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
    );
    CREATE TABLE IF NOT EXISTS review_sessions (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES reviews(id),
      session_id TEXT NOT NULL REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS review_git_commits (
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
    );
    CREATE TABLE IF NOT EXISTS command_events (
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
    );
  `)

  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

describe('Streak Service', () => {
  let repos: ReturnType<typeof createRepositories>
  let streakService: ReturnType<typeof createStreakService>

  beforeEach(() => {
    const { db } = createTestDb()
    repos = createRepositories(db)
    streakService = createStreakService({ repos })
  })

  function createProject(slug: string, displayName: string) {
    return repos.projects.create({
      id: crypto.randomUUID(),
      slug,
      displayName,
      isDeleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  function createSession(
    projectId: string,
    startTime: number,
    endTime: number,
    idleDeductedMs = 0,
  ) {
    return repos.sessions.create({
      id: crypto.randomUUID(),
      projectId,
      startTime,
      endTime,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs,
      isDeleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  /** Create a 2-hour session on the given day (at noon). */
  function createDaySession(projectId: string, day: DateTime, durationMinutes = 120) {
    const start = day.startOf('day').plus({ hours: 10 }).toMillis()
    const end = start + durationMinutes * 60_000
    return createSession(projectId, start, end)
  }

  describe('getStreak', () => {
    it('returns zeros when no sessions exist', () => {
      const result = streakService.getStreak()
      expect(result.current).toBe(0)
      expect(result.best).toBe(0)
      expect(result.avgDailyMinutes).toBe(0)
      expect(result.last28Days).toHaveLength(28)
      expect(result.last28Days.every(d => d.minutes === 0)).toBe(true)
    })

    it('computes streak for 3 consecutive days', () => {
      const project = createProject('test', 'Test')
      const today = DateTime.now().startOf('day')

      createDaySession(project.id, today)
      createDaySession(project.id, today.minus({ days: 1 }))
      createDaySession(project.id, today.minus({ days: 2 }))

      const result = streakService.getStreak()
      expect(result.current).toBe(3)
      expect(result.best).toBe(3)
    })

    it('handles broken streak (3 days, gap, 2 days)', () => {
      const project = createProject('test', 'Test')
      const today = DateTime.now().startOf('day')

      // Current: today + yesterday = 2 day streak
      createDaySession(project.id, today)
      createDaySession(project.id, today.minus({ days: 1 }))
      // Gap on day -2
      // Older 3-day streak: days -3, -4, -5
      createDaySession(project.id, today.minus({ days: 3 }))
      createDaySession(project.id, today.minus({ days: 4 }))
      createDaySession(project.id, today.minus({ days: 5 }))

      const result = streakService.getStreak()
      expect(result.current).toBe(2)
      expect(result.best).toBe(3)
    })

    it('with goal: day below goal does not count', () => {
      const project = createProject('test', 'Test')
      const today = DateTime.now().startOf('day')
      const goalMinutes = 360 // 6 hours

      // Today: 7 hours (counts)
      createDaySession(project.id, today, 420)
      // Yesterday: 5 hours (below goal, does not count)
      createDaySession(project.id, today.minus({ days: 1 }), 300)
      // Day before: 8 hours (counts)
      createDaySession(project.id, today.minus({ days: 2 }), 480)

      const result = streakService.getStreak(goalMinutes)
      expect(result.current).toBe(1) // only today counts
      expect(result.best).toBe(1) // each qualifying day is isolated
    })

    it('without goal: any tracked time counts toward streak', () => {
      const project = createProject('test', 'Test')
      const today = DateTime.now().startOf('day')

      // Even 1 minute should count
      createDaySession(project.id, today, 1)
      createDaySession(project.id, today.minus({ days: 1 }), 1)

      const result = streakService.getStreak()
      expect(result.current).toBe(2)
    })

    it('computes correct average across tracked days', () => {
      const project = createProject('test', 'Test')
      const today = DateTime.now().startOf('day')

      // Day 1: 60 minutes, Day 2: 120 minutes, Day 3: 180 minutes
      createDaySession(project.id, today, 60)
      createDaySession(project.id, today.minus({ days: 1 }), 120)
      createDaySession(project.id, today.minus({ days: 2 }), 180)

      const result = streakService.getStreak()
      // Average: (60 + 120 + 180) / 3 = 120
      expect(result.avgDailyMinutes).toBe(120)
    })

    it('returns exactly 28 entries for last28Days', () => {
      const project = createProject('test', 'Test')
      const today = DateTime.now().startOf('day')

      createDaySession(project.id, today)

      const result = streakService.getStreak()
      expect(result.last28Days).toHaveLength(28)

      // First entry should be 27 days ago
      const expectedFirst = today.minus({ days: 27 }).toISODate()!
      expect(result.last28Days[0]!.date).toBe(expectedFirst)

      // Last entry should be today
      const expectedLast = today.toISODate()!
      expect(result.last28Days[27]!.date).toBe(expectedLast)
    })

    it('starts streak from yesterday if today has no time', () => {
      const project = createProject('test', 'Test')
      const today = DateTime.now().startOf('day')

      // No session today, but yesterday + day before
      createDaySession(project.id, today.minus({ days: 1 }))
      createDaySession(project.id, today.minus({ days: 2 }))

      const result = streakService.getStreak()
      expect(result.current).toBe(2)
    })
  })

  describe('getHeatmapData', () => {
    it('returns 365 days for a non-leap year', () => {
      const result = streakService.getHeatmapData(undefined, 2023)
      expect(result).toHaveLength(365)
      expect(result[0]!.date).toBe('2023-01-01')
      expect(result[364]!.date).toBe('2023-12-31')
    })

    it('returns 366 days for a leap year', () => {
      const result = streakService.getHeatmapData(undefined, 2024)
      expect(result).toHaveLength(366)
      expect(result[0]!.date).toBe('2024-01-01')
      expect(result[365]!.date).toBe('2024-12-31')
    })

    it('fills zero-minute days for dates with no sessions', () => {
      const project = createProject('test', 'Test')
      const jan5 = DateTime.fromObject({ year: 2024, month: 1, day: 5 })
      createDaySession(project.id, jan5, 90)

      const result = streakService.getHeatmapData(undefined, 2024)

      // Jan 5 should have minutes
      const jan5Entry = result.find(d => d.date === '2024-01-05')
      expect(jan5Entry).toBeDefined()
      expect(jan5Entry!.minutes).toBe(90)
      expect(jan5Entry!.metGoal).toBe(true)

      // Jan 1 should be zero
      const jan1Entry = result.find(d => d.date === '2024-01-01')
      expect(jan1Entry).toBeDefined()
      expect(jan1Entry!.minutes).toBe(0)
      expect(jan1Entry!.metGoal).toBe(false)
    })

    it('defaults to current year when no year provided', () => {
      const result = streakService.getHeatmapData()
      const currentYear = DateTime.now().year
      expect(result[0]!.date).toBe(`${currentYear}-01-01`)
    })
  })
})
