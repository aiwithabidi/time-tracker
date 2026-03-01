import { describe, it, expect, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import { ensureSchema } from '../../src/db/migrate'
import { createRepositories } from '../../src/db/repositories/index'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  ensureSchema(sqlite)
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

function createTestProject(repos: ReturnType<typeof createRepositories>) {
  return repos.projects.create({
    id: crypto.randomUUID(),
    slug: 'test-project',
    displayName: 'Test Project',
    isDeleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

describe('Session Lifecycle Integration', () => {
  let repos: ReturnType<typeof createRepositories>

  beforeEach(() => {
    const { db } = createTestDb()
    repos = createRepositories(db)
  })

  it('creates a project and session', () => {
    const project = createTestProject(repos)
    expect(project.slug).toBe('test-project')

    const now = Date.now()
    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      timezone: 'America/New_York',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    expect(session.projectId).toBe(project.id)
    expect(session.endTime).toBeNull()
  })

  it('finds active sessions', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    const active = repos.sessions.findActiveByProject(project.id)
    expect(active).toBeDefined()
    expect(active!.projectId).toBe(project.id)

    const allActive = repos.sessions.findActiveAll()
    expect(allActive).toHaveLength(1)
  })

  it('stops a session with end time', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now - 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    const stopped = repos.sessions.stop(session.id, now)
    expect(stopped.endTime).toBe(now)

    const active = repos.sessions.findActiveByProject(project.id)
    expect(active).toBeUndefined()
  })

  it('attaches and checks terminal', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    repos.sessions.attachTerminal(session.id, 'term-1')
    expect(repos.sessions.isTerminalAttached(session.id, 'term-1')).toBe(true)
    expect(repos.sessions.isTerminalAttached(session.id, 'term-2')).toBe(false)
  })

  it('creates and retrieves pulses', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    repos.pulses.create({
      id: crypto.randomUUID(),
      sessionId: session.id,
      terminalId: 'term-1',
      sourceType: 'shell-hook',
      timestamp: now,
    })

    repos.pulses.create({
      id: crypto.randomUUID(),
      sessionId: session.id,
      terminalId: 'term-1',
      sourceType: 'shell-hook',
      timestamp: now + 60_000,
    })

    const latest = repos.pulses.getLatestForSession(session.id)
    expect(latest).toBeDefined()
    expect(latest!.timestamp).toBe(now + 60_000)

    const latestTerminal = repos.pulses.getLatestForTerminal('term-1')
    expect(latestTerminal).toBeDefined()
  })

  it('adds and retrieves notes', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    repos.notes.create(session.id, 'First note')
    repos.notes.create(session.id, 'Second note')

    const notes = repos.notes.findBySessionId(session.id)
    expect(notes).toHaveLength(2)
    expect(notes[0]!.content).toBe('First note')
  })

  it('adds, retrieves, and removes tags', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    repos.tags.addTag(session.id, 'billable')
    repos.tags.addTag(session.id, 'feature')

    const tags = repos.tags.findBySessionId(session.id)
    expect(tags).toHaveLength(2)

    // Idempotent add
    repos.tags.addTag(session.id, 'billable')
    const tagsAfterDupe = repos.tags.findBySessionId(session.id)
    expect(tagsAfterDupe).toHaveLength(2)

    repos.tags.removeTag(session.id, 'billable')
    const tagsAfterRemove = repos.tags.findBySessionId(session.id)
    expect(tagsAfterRemove).toHaveLength(1)
    expect(tagsAfterRemove[0]!.tag).toBe('feature')
  })

  it('performs undo push and pop', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      endTime: now + 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    repos.undo.push('edit', {
      sessions: [session],
      notes: [],
      tags: [],
    })

    const entry = repos.undo.pop()
    expect(entry).toBeDefined()
    expect(entry!.operation).toBe('edit')
    expect(entry!.snapshot.sessions).toHaveLength(1)
    expect(entry!.snapshot.sessions[0]!.id).toBe(session.id)

    // Stack should be empty now
    const empty = repos.undo.pop()
    expect(empty).toBeUndefined()
  })

  it('soft deletes and hard deletes sessions', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    repos.sessions.softDelete(session.id)
    const afterSoft = repos.sessions.findById(session.id)
    expect(afterSoft).toBeUndefined() // filtered by isDeleted

    repos.sessions.hardDelete(session.id)
    // No way to find it at all now
    const allActive = repos.sessions.findActiveAll()
    expect(allActive).toHaveLength(0)
  })

  it('resumes from idle adding to idle deducted', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now - 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 1000,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    const resumed = repos.sessions.resumeFromIdle(session.id, 5000)
    expect(resumed.idleDeductedMs).toBe(6000)
    expect(resumed.pausedAt).toBeNull()
  })

  it('sets and clears pausedAt', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    const paused = repos.sessions.setPausedAt(session.id, now)
    expect(paused.pausedAt).toBe(now)

    const unpaused = repos.sessions.setPausedAt(session.id, null)
    expect(unpaused.pausedAt).toBeNull()
  })

  it('finds sessions by date range', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    // Create 3 sessions at different times
    repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now - 2 * 86400_000, // 2 days ago
      endTime: now - 2 * 86400_000 + 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now - 86400_000, // yesterday
      endTime: now - 86400_000 + 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now, // today
      endTime: now + 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    const allThree = repos.sessions.findByDateRange(now - 3 * 86400_000, now + 86400_000)
    expect(allThree).toHaveLength(3)

    const lastTwo = repos.sessions.findByDateRange(now - 1.5 * 86400_000, now + 86400_000)
    expect(lastTwo).toHaveLength(2)

    const withProject = repos.sessions.findByDateRange(
      now - 3 * 86400_000,
      now + 86400_000,
      project.id,
    )
    expect(withProject).toHaveLength(3)
  })

  it('finds last completed session', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now - 7200_000,
      endTime: now - 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    const laterId = crypto.randomUUID()
    repos.sessions.create({
      id: laterId,
      projectId: project.id,
      startTime: now - 3600_000,
      endTime: now - 1800_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    // Active session (no end time)
    repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    const last = repos.sessions.findLastCompleted()
    expect(last).toBeDefined()
    expect(last!.id).toBe(laterId)
  })

  it('finds session by prefix', () => {
    const project = createTestProject(repos)
    const now = Date.now()
    const id = 'abcdef12-3456-7890-abcd-ef1234567890'

    repos.sessions.create({
      id,
      projectId: project.id,
      startTime: now,
      endTime: now + 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    const found = repos.sessions.findByPrefix('abcdef')
    expect(found.id).toBe(id)
  })

  it('restores a session via undo', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const session = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      endTime: now + 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    // Modify the session
    repos.sessions.update(session.id, { source: 'pulse' })

    // Restore original
    repos.sessions.restore(session)
    const restored = repos.sessions.findById(session.id)
    expect(restored).toBeDefined()
    expect(restored!.source).toBe('manual')
  })

  it('reassigns pulses between sessions', () => {
    const project = createTestProject(repos)
    const now = Date.now()

    const sessionA = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now - 3600_000,
      endTime: now,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    const sessionB = repos.sessions.create({
      id: crypto.randomUUID(),
      projectId: project.id,
      startTime: now,
      endTime: now + 3600_000,
      timezone: 'UTC',
      source: 'manual',
      idleDeductedMs: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })

    repos.pulses.create({
      id: crypto.randomUUID(),
      sessionId: sessionA.id,
      terminalId: 'term-1',
      sourceType: 'shell-hook',
      timestamp: now - 1800_000,
    })
    repos.pulses.create({
      id: crypto.randomUUID(),
      sessionId: sessionA.id,
      terminalId: 'term-1',
      sourceType: 'shell-hook',
      timestamp: now + 100,
    })

    // Reassign only pulses before split point
    repos.pulses.reassignPulses(sessionA.id, sessionB.id, now)

    const aPulses = repos.pulses.findBySessionId(sessionA.id)
    const bPulses = repos.pulses.findBySessionId(sessionB.id)
    expect(aPulses).toHaveLength(1)
    expect(bPulses).toHaveLength(1)
  })
})
