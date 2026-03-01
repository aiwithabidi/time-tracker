import { describe, it, expect, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import { ensureSchema } from '../../src/db/migrate'
import { createRepositories } from '../../src/db/repositories/index'
import { createReportService } from '../../src/core/reports/report-service'
import { DateTime } from 'luxon'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  ensureSchema(sqlite)
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

describe('Report Service Integration', () => {
  let repos: ReturnType<typeof createRepositories>
  let reportService: ReturnType<typeof createReportService>

  beforeEach(() => {
    const { db } = createTestDb()
    repos = createRepositories(db)
    reportService = createReportService({ repos })
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
    endTime: number | null,
    idleDeductedMs = 0,
  ) {
    return repos.sessions.create({
      id: crypto.randomUUID(),
      projectId,
      startTime,
      endTime: endTime ?? undefined,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs,
      isDeleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  describe('today', () => {
    it('returns empty summary when no sessions', () => {
      const result = reportService.today()
      expect(result.projects).toHaveLength(0)
      expect(result.grandTotalMs).toBe(0)
      expect(result.activeSession).toBeUndefined()
    })

    it('aggregates sessions for today', () => {
      const project = createProject('proj-a', 'Project A')
      const now = DateTime.now()
      const todayStart = now.startOf('day').toMillis()

      // Two 1-hour sessions today
      createSession(project.id, todayStart + 1000, todayStart + 3601_000)
      createSession(project.id, todayStart + 7200_000, todayStart + 10800_000)

      const result = reportService.today()
      expect(result.projects).toHaveLength(1)
      expect(result.projects[0]!.sessionCount).toBe(2)
      expect(result.grandTotalMs).toBeGreaterThan(0)
    })

    it('detects active session', () => {
      const project = createProject('proj-a', 'Project A')
      const now = DateTime.now()
      const todayStart = now.startOf('day').toMillis()

      // Active session (no end time)
      createSession(project.id, todayStart + 1000, null)

      const result = reportService.today()
      expect(result.activeSession).toBeDefined()
      expect(result.activeSession!.project.slug).toBe('proj-a')
    })

    it('excludes yesterday sessions from today', () => {
      const project = createProject('proj-a', 'Project A')
      const yesterday = DateTime.now().minus({ days: 1 }).startOf('day').toMillis()

      createSession(project.id, yesterday + 1000, yesterday + 3601_000)

      const result = reportService.today()
      expect(result.projects).toHaveLength(0)
    })
  })

  describe('week', () => {
    it('returns empty summary when no sessions', () => {
      const result = reportService.week()
      expect(result.projects).toHaveLength(0)
      expect(result.grandTotalMs).toBe(0)
    })

    it('aggregates sessions across multiple projects', () => {
      const projectA = createProject('proj-a', 'Project A')
      const projectB = createProject('proj-b', 'Project B')
      const weekStart = DateTime.now().startOf('week').toMillis()

      createSession(projectA.id, weekStart + 1000, weekStart + 3601_000)
      createSession(projectB.id, weekStart + 7200_000, weekStart + 10800_000)

      const result = reportService.week()
      expect(result.projects).toHaveLength(2)
      expect(result.grandTotalMs).toBeGreaterThan(0)
    })

    it('filters by project slug', () => {
      const projectA = createProject('proj-a', 'Project A')
      const projectB = createProject('proj-b', 'Project B')
      const weekStart = DateTime.now().startOf('week').toMillis()

      createSession(projectA.id, weekStart + 1000, weekStart + 3601_000)
      createSession(projectB.id, weekStart + 7200_000, weekStart + 10800_000)

      const result = reportService.week('proj-a')
      expect(result.projects).toHaveLength(1)
      expect(result.projects[0]!.project.slug).toBe('proj-a')
    })

    it('throws for unknown project', () => {
      expect(() => reportService.week('nonexistent')).toThrow('not found')
    })
  })

  describe('log', () => {
    it('groups sessions by day', () => {
      const project = createProject('proj-a', 'Project A')
      const today = DateTime.now().startOf('day').toMillis()
      const yesterday = today - 86400_000

      createSession(project.id, today + 1000, today + 3601_000)
      createSession(project.id, yesterday + 1000, yesterday + 3601_000)

      const result = reportService.log()
      expect(result.length).toBeGreaterThanOrEqual(2)

      // Should be sorted by date descending
      const dates = result.map(g => g.date)
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]! >= dates[i]!).toBe(true)
      }
    })

    it('filters by project slug', () => {
      const projectA = createProject('proj-a', 'Project A')
      const projectB = createProject('proj-b', 'Project B')
      const today = DateTime.now().startOf('day').toMillis()

      createSession(projectA.id, today + 1000, today + 3601_000)
      createSession(projectB.id, today + 7200_000, today + 10800_000)

      const result = reportService.log({ projectSlug: 'proj-a' })
      const allSessions = result.flatMap(g => g.sessions)
      expect(allSessions.every(s => s.project.slug === 'proj-a')).toBe(true)
    })

    it('filters by date range', () => {
      const project = createProject('proj-a', 'Project A')
      const today = DateTime.now()

      // Create sessions over 10 days
      for (let i = 0; i < 10; i++) {
        const start = today.minus({ days: i }).startOf('day').toMillis() + 1000
        createSession(project.id, start, start + 3600_000)
      }

      const from = today.minus({ days: 3 }).toISODate()!
      const to = today.toISODate()!
      const result = reportService.log({ from, to })

      // Should only include sessions within the range
      expect(result.length).toBeLessThanOrEqual(4)
    })
  })

  describe('last', () => {
    it('returns null when no completed sessions', () => {
      const result = reportService.last()
      expect(result).toBeNull()
    })

    it('returns last completed session', () => {
      const project = createProject('proj-a', 'Project A')
      const now = Date.now()

      createSession(project.id, now - 7200_000, now - 3600_000)
      createSession(project.id, now - 3600_000, now - 1000)

      const result = reportService.last()
      expect(result).not.toBeNull()
      expect(result!.project.slug).toBe('proj-a')
      expect(result!.durationMs).toBeGreaterThan(0)
    })

    it('ignores active sessions', () => {
      const project = createProject('proj-a', 'Project A')
      const now = Date.now()

      createSession(project.id, now - 3600_000, now - 1000)
      createSession(project.id, now, null) // active

      const result = reportService.last()
      expect(result).not.toBeNull()
      expect(result!.session.endTime).not.toBeNull()
    })
  })

  describe('allProjects', () => {
    it('returns all projects with this-week stats', () => {
      const projectA = createProject('proj-a', 'Project A')
      const projectB = createProject('proj-b', 'Project B')
      const weekStart = DateTime.now().startOf('week').toMillis()

      createSession(projectA.id, weekStart + 1000, weekStart + 3601_000)
      // projectB has no sessions this week

      const result = reportService.allProjects()
      expect(result).toHaveLength(2)

      const projA = result.find(p => p.project.slug === 'proj-a')
      const projB = result.find(p => p.project.slug === 'proj-b')
      expect(projA!.sessionCount).toBe(1)
      expect(projB!.sessionCount).toBe(0)
    })
  })
})
