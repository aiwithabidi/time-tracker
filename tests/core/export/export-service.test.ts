import { describe, it, expect } from 'vitest'
import type { SessionWithDetails } from '../../../src/core/export/export-service'
import { createExportService } from '../../../src/core/export/export-service'
import type { Session } from '../../../src/db/types'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    startTime: 1700000000000, // 2023-11-14 22:13:20 UTC
    endTime: 1700003600000,   // +1 hour
    timezone: 'UTC',
    source: 'manual',
    rateAtTime: null,
    pausedAt: null,
    idleDeductedMs: 0,
    isDeleted: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  }
}

function makeSessionWithDetails(
  overrides: Partial<SessionWithDetails> = {},
  sessionOverrides: Partial<Session> = {},
): SessionWithDetails {
  return {
    session: makeSession(sessionOverrides),
    projectSlug: 'my-project',
    projectName: 'My Project',
    notes: [],
    tags: [],
    ...overrides,
  }
}

describe('ExportService.toCSV', () => {
  // We need a minimal repos mock just for createExportService signature
  // but toCSV does not use repos, so we test it directly via the service
  const mockRepos = {
    projects: { findBySlug: () => undefined, findAll: () => [] },
    sessions: { findByDateRange: () => [] },
    notes: { findBySession: () => [] },
    tags: { findBySession: () => [] },
    pulses: {},
  } as any

  const service = createExportService(mockRepos)

  it('produces correct header row', () => {
    const csv = service.toCSV([], 'UTC')
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('project,date,start_time,end_time,duration_hours,duration_human,notes,tags')
  })

  it('formats session data correctly', () => {
    const sessions = [makeSessionWithDetails()]
    const csv = service.toCSV(sessions, 'UTC')
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(2)

    const fields = lines[1]!.split(',')
    expect(fields[0]).toBe('my-project')
    expect(fields[1]).toBe('2023-11-14')
    expect(fields[2]).toBe('22:13')
    expect(fields[3]).toBe('23:13')
    expect(fields[4]).toBe('1.00')
    expect(fields[5]).toBe('1h')
  })

  it('accounts for idle deduction in duration_hours', () => {
    // 1 hour session minus 30 min idle = 0.50 hours
    const sessions = [makeSessionWithDetails({}, { idleDeductedMs: 1_800_000 })]
    const csv = service.toCSV(sessions, 'UTC')
    const lines = csv.trim().split('\n')
    const fields = lines[1]!.split(',')
    expect(fields[4]).toBe('0.50')
    expect(fields[5]).toBe('30m')
  })

  it('shows "active" for sessions without endTime', () => {
    const sessions = [makeSessionWithDetails({}, { endTime: null })]
    const csv = service.toCSV(sessions, 'UTC')
    const lines = csv.trim().split('\n')
    const fields = lines[1]!.split(',')
    expect(fields[3]).toBe('active')
  })

  it('joins notes with "; " and tags with ", "', () => {
    const sessions = [makeSessionWithDetails({
      notes: ['Fixed bug', 'Added test'],
      tags: ['feature', 'bug-fix'],
    })]
    const csv = service.toCSV(sessions, 'UTC')
    const lines = csv.trim().split('\n')
    // Notes with "; " may contain semicolons so check the raw line
    expect(lines[1]).toContain('Fixed bug; Added test')
    expect(lines[1]).toContain('feature, bug-fix')
  })

  it('escapes notes containing commas', () => {
    const sessions = [makeSessionWithDetails({
      notes: ['hello, world'],
    })]
    const csv = service.toCSV(sessions, 'UTC')
    const lines = csv.trim().split('\n')
    expect(lines[1]).toContain('"hello, world"')
  })
})

describe('ExportService.getDryRunSummary', () => {
  const mockRepos = {
    projects: { findBySlug: () => undefined, findAll: () => [] },
    sessions: { findByDateRange: () => [] },
    notes: { findBySession: () => [] },
    tags: { findBySession: () => [] },
    pulses: {},
  } as any

  const service = createExportService(mockRepos)

  it('returns correct count and totalMs', () => {
    const sessions = [
      makeSessionWithDetails({}, { startTime: 1000, endTime: 5000, idleDeductedMs: 500 }),
      makeSessionWithDetails({}, { startTime: 6000, endTime: 10000, idleDeductedMs: 1000 }),
    ]
    const summary = service.getDryRunSummary(sessions)
    expect(summary.count).toBe(2)
    // (5000-1000-500) + (10000-6000-1000) = 3500 + 3000 = 6500
    expect(summary.totalMs).toBe(6500)
  })

  it('returns zero for empty array', () => {
    const summary = service.getDryRunSummary([])
    expect(summary.count).toBe(0)
    expect(summary.totalMs).toBe(0)
  })
})
