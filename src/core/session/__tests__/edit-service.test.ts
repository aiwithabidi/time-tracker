import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockRepos, makeSession, makeProject, makeNote, makeTag } from './mock-repos'
import type { Repositories } from '../../../db/repositories/index'

// Mock external dependencies
vi.mock('../../../services/project-resolver', () => ({
  resolveProject: vi.fn(),
  ensureProjectInDb: vi.fn(),
}))

vi.mock('../../../db/client', () => ({
  withTransaction: vi.fn().mockImplementation((fn: () => unknown) => fn()),
}))

vi.mock('../../../config/config-loader', () => ({
  loadConfig: vi.fn().mockReturnValue({
    projects: {},
    defaults: { currency: 'USD' },
    idle: { softIdleMinutes: 8, hardIdleMinutes: 20 },
  }),
}))

vi.mock('../../../cli/time-parsing', () => ({
  parseEditTime: vi.fn().mockImplementation((input: string, _ref: number) => {
    // Simple mock: return the numeric value if it looks like a timestamp
    const num = Number(input)
    if (!isNaN(num)) return num
    return Date.now()
  }),
}))

import { createEditService } from '../edit-service'
import { resolveProject, ensureProjectInDb } from '../../../services/project-resolver'
import {
  NoActiveSessionError,
  InvalidTagError,
  NothingToUndoError,
  InvalidTimeRangeError,
  InvalidSplitTimeError,
  MergeValidationError,
} from '../errors'
import { parseEditTime } from '../../../cli/time-parsing'

describe('createEditService', () => {
  let repos: Repositories
  let service: ReturnType<typeof createEditService>

  beforeEach(() => {
    repos = createMockRepos()
    service = createEditService({ repos })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setupProjectResolution(project = makeProject()) {
    vi.mocked(resolveProject).mockReturnValue({
      slug: project.slug,
      displayName: project.displayName,
      directoryPath: project.directoryPath ?? '/tmp/test',
      source: 'git',
      currency: 'USD',
    })
    vi.mocked(ensureProjectInDb).mockReturnValue(project)
    return project
  }

  describe('addNote', () => {
    it('adds a note to the active session', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

      const result = service.addNote('/tmp/test', 'My note')
      expect(result.session).toBe(session)
      expect(repos.notes.create).toHaveBeenCalledWith(session.id, 'My note')
    })

    it('throws when note exceeds 10000 characters', () => {
      const longNote = 'x'.repeat(10_001)
      expect(() => service.addNote('/tmp/test', longNote)).toThrow('10,000 character limit')
    })

    it('allows note at exactly 10000 characters', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

      const exactNote = 'x'.repeat(10_000)
      const result = service.addNote('/tmp/test', exactNote)
      expect(result.session).toBe(session)
    })

    it('throws NoActiveSessionError when no active session', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

      expect(() => service.addNote('/tmp/unknown', 'note')).toThrow(NoActiveSessionError)
    })
  })

  describe('addTag', () => {
    it('adds a tag to the active session', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

      const result = service.addTag('/tmp/test', 'bug-fix')
      expect(result.session).toBe(session)
      expect(repos.tags.addTag).toHaveBeenCalledWith(session.id, 'bug-fix')
    })

    it('throws InvalidTagError for invalid tag format', () => {
      expect(() => service.addTag('/tmp/test', 'Not-Valid')).toThrow(InvalidTagError)
      expect(() => service.addTag('/tmp/test', 'has spaces')).toThrow(InvalidTagError)
      expect(() => service.addTag('/tmp/test', '-leading')).toThrow(InvalidTagError)
    })

    it('accepts valid kebab-case tags', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

      service.addTag('/tmp/test', 'billable')
      service.addTag('/tmp/test', 'bug-fix')
      service.addTag('/tmp/test', 'a1-b2-c3')

      expect(repos.tags.addTag).toHaveBeenCalledTimes(3)
    })

    it('throws NoActiveSessionError when no active session', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

      expect(() => service.addTag('/tmp/unknown', 'tag')).toThrow(NoActiveSessionError)
    })
  })

  describe('removeTag', () => {
    it('removes a tag from the active session', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

      service.removeTag('/tmp/test', 'old-tag')
      expect(repos.tags.removeTag).toHaveBeenCalledWith(session.id, 'old-tag')
    })

    it('throws NoActiveSessionError when no active session', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

      expect(() => service.removeTag('/tmp/unknown', 'tag')).toThrow(NoActiveSessionError)
    })
  })

  describe('edit', () => {
    it('edits start time of a session', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])
      vi.mocked(parseEditTime).mockReturnValue(2000)

      const result = service.edit('abc123', { start: '2000' })
      expect(result.changes.length).toBeGreaterThan(0)
      expect(repos.sessions.update).toHaveBeenCalled()
    })

    it('edits end time of a completed session', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])
      vi.mocked(parseEditTime).mockReturnValue(6000)

      const result = service.edit('abc123', { end: '6000' })
      expect(result.changes.length).toBeGreaterThan(0)
    })

    it('throws InvalidTimeRangeError for end time on active session', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: null,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

      expect(() => service.edit('abc123', { end: '6000' })).toThrow(InvalidTimeRangeError)
    })

    it('throws InvalidTimeRangeError when start >= end', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])
      vi.mocked(parseEditTime).mockReturnValue(6000)

      expect(() => service.edit('abc123', { start: '6000' })).toThrow(InvalidTimeRangeError)
    })

    it('changes project', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      const newProject = makeProject({ id: 'proj-2', slug: 'new-proj' })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])
      vi.mocked(repos.projects.findBySlug).mockReturnValue(newProject)

      const result = service.edit('abc123', { project: 'new-proj' })
      expect(result.changes.some(c => c.includes('project'))).toBe(true)
    })

    it('throws when project not found', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])
      vi.mocked(repos.projects.findBySlug).mockReturnValue(undefined)

      expect(() => service.edit('abc123', { project: 'nonexistent' })).toThrow('not found')
    })

    it('adds note via edit', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

      const result = service.edit('abc123', { note: 'a note' })
      expect(repos.notes.create).toHaveBeenCalledWith(session.id, 'a note')
    })

    it('rejects note exceeding limit via edit', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

      expect(() => service.edit('abc123', { note: 'x'.repeat(10_001) })).toThrow('10,000 character limit')
    })

    it('adds and removes tags via edit', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

      service.edit('abc123', { tag: 'new-tag', untag: 'old-tag' })
      expect(repos.tags.addTag).toHaveBeenCalledWith(session.id, 'new-tag')
      expect(repos.tags.removeTag).toHaveBeenCalledWith(session.id, 'old-tag')
    })

    it('pushes undo snapshot', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

      service.edit('abc123', { note: 'test' })
      expect(repos.undo.push).toHaveBeenCalledWith('edit', expect.any(Object))
    })
  })

  describe('undo', () => {
    it('restores sessions, notes, and tags from snapshot', () => {
      const session = makeSession({ id: 's1' })
      const note = makeNote({ sessionId: 's1' })
      const tag = makeTag({ sessionId: 's1' })

      vi.mocked(repos.undo.pop).mockReturnValue({
        operation: 'edit',
        snapshot: {
          sessions: [session],
          notes: [note],
          tags: [tag],
        },
      })

      const result = service.undo()
      expect(result.operation).toBe('edit')
      expect(result.restoredSessionIds).toEqual(['s1'])
      expect(repos.sessions.restore).toHaveBeenCalledWith(session)
      expect(repos.notes.deleteBySessionId).toHaveBeenCalledWith('s1')
      expect(repos.notes.restoreNote).toHaveBeenCalledWith(note)
      expect(repos.tags.deleteBySessionId).toHaveBeenCalledWith('s1')
      expect(repos.tags.restoreTag).toHaveBeenCalledWith(tag)
    })

    it('hard-deletes sessions created by undone operation', () => {
      vi.mocked(repos.undo.pop).mockReturnValue({
        operation: 'start',
        snapshot: {
          sessions: [],
          notes: [],
          tags: [],
          deletedSessionIds: ['new-session-id'],
        },
      })

      service.undo()
      expect(repos.sessions.hardDelete).toHaveBeenCalledWith('new-session-id')
    })

    it('throws NothingToUndoError when stack is empty', () => {
      vi.mocked(repos.undo.pop).mockReturnValue(undefined)

      expect(() => service.undo()).toThrow(NothingToUndoError)
    })
  })

  describe('previewSplit', () => {
    it('computes split preview with correct times', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
        idleDeductedMs: 0,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(parseEditTime).mockReturnValue(3000)

      const preview = service.previewSplit('abc123', '3000')
      expect(preview.original).toBe(session)
      expect(preview.sessionA.startTime).toBe(1000)
      expect(preview.sessionA.endTime).toBe(3000)
      expect(preview.sessionB.startTime).toBe(3000)
      expect(preview.sessionB.endTime).toBe(5000)
      expect(preview.sessionA.durationMs).toBe(2000)
      expect(preview.sessionB.durationMs).toBe(2000)
    })

    it('distributes idle deduction proportionally', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 0,
        endTime: 10000,
        idleDeductedMs: 2000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(parseEditTime).mockReturnValue(5000)

      const preview = service.previewSplit('abc123', '5000')
      expect(preview.sessionA.idleDeductedMs + preview.sessionB.idleDeductedMs).toBe(2000)
    })

    it('throws for active session', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: null,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)

      expect(() => service.previewSplit('abc123', '3000')).toThrow(InvalidTimeRangeError)
    })

    it('throws when split time is outside bounds', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(parseEditTime).mockReturnValue(500)

      expect(() => service.previewSplit('abc123', '500')).toThrow(InvalidSplitTimeError)
    })
  })

  describe('split', () => {
    it('creates two sessions from one', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
        idleDeductedMs: 0,
      })
      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])
      vi.mocked(parseEditTime).mockReturnValue(3000)
      vi.mocked(repos.sessions.create)
        .mockImplementationOnce((data) => ({ ...makeSession(), ...data }))
        .mockImplementationOnce((data) => ({ ...makeSession(), ...data }))

      const result = service.split('abc123', '3000')
      expect(result.originalId).toBe(session.id)
      expect(repos.sessions.softDelete).toHaveBeenCalledWith(session.id)
      expect(repos.sessions.create).toHaveBeenCalledTimes(2)
      expect(repos.undo.push).toHaveBeenCalledWith('split', expect.any(Object))
    })

    it('copies notes and tags to both new sessions', () => {
      const session = makeSession({
        id: 'abc12345-0000-0000-0000-000000000000',
        startTime: 1000,
        endTime: 5000,
        idleDeductedMs: 0,
      })
      const note = makeNote({ sessionId: session.id, content: 'test' })
      const tag = makeTag({ sessionId: session.id, tag: 'feat' })

      vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([note])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([tag])
      vi.mocked(parseEditTime).mockReturnValue(3000)
      vi.mocked(repos.sessions.create)
        .mockImplementationOnce((data) => ({ ...makeSession(), ...data }))
        .mockImplementationOnce((data) => ({ ...makeSession(), ...data }))

      service.split('abc123', '3000')

      // Notes created for both sessions
      expect(repos.notes.create).toHaveBeenCalledTimes(2)
      // Tags created for both sessions
      expect(repos.tags.addTag).toHaveBeenCalledTimes(2)
    })
  })

  describe('previewMerge', () => {
    it('computes merge preview for adjacent sessions', () => {
      const sessionA = makeSession({
        id: 'aaa12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 1000,
        endTime: 3000,
        idleDeductedMs: 0,
      })
      const sessionB = makeSession({
        id: 'bbb12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 3000,
        endTime: 5000,
        idleDeductedMs: 0,
      })

      vi.mocked(repos.sessions.findByPrefix)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)

      const preview = service.previewMerge('aaa123', 'bbb123')
      expect(preview.earlier).toBe(sessionA)
      expect(preview.later).toBe(sessionB)
      expect(preview.gapMs).toBe(0)
      expect(preview.merged.startTime).toBe(1000)
      expect(preview.merged.endTime).toBe(5000)
      expect(preview.requiresForce).toBe(false)
    })

    it('requires force for large gaps', () => {
      const sessionA = makeSession({
        id: 'aaa12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 1000,
        endTime: 3000,
        idleDeductedMs: 0,
      })
      const sessionB = makeSession({
        id: 'bbb12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 3000 + 2 * 60 * 60 * 1000, // 2 hours gap
        endTime: 3000 + 3 * 60 * 60 * 1000,
        idleDeductedMs: 0,
      })

      vi.mocked(repos.sessions.findByPrefix)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)

      const preview = service.previewMerge('aaa123', 'bbb123')
      expect(preview.requiresForce).toBe(true)
    })

    it('throws for active session', () => {
      const sessionA = makeSession({
        id: 'aaa12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 1000,
        endTime: null,
      })
      const sessionB = makeSession({
        id: 'bbb12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 3000,
        endTime: 5000,
      })

      vi.mocked(repos.sessions.findByPrefix)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)

      expect(() => service.previewMerge('aaa123', 'bbb123')).toThrow(MergeValidationError)
    })

    it('throws for different projects', () => {
      const sessionA = makeSession({
        id: 'aaa12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 1000,
        endTime: 3000,
      })
      const sessionB = makeSession({
        id: 'bbb12345-0000-0000-0000-000000000000',
        projectId: 'proj-2',
        startTime: 3000,
        endTime: 5000,
      })

      vi.mocked(repos.sessions.findByPrefix)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)

      expect(() => service.previewMerge('aaa123', 'bbb123')).toThrow(MergeValidationError)
    })
  })

  describe('merge', () => {
    it('merges two sessions into one', () => {
      const sessionA = makeSession({
        id: 'aaa12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 1000,
        endTime: 3000,
        idleDeductedMs: 0,
      })
      const sessionB = makeSession({
        id: 'bbb12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 3000,
        endTime: 5000,
        idleDeductedMs: 0,
      })

      vi.mocked(repos.sessions.findByPrefix)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)
      vi.mocked(repos.sessions.findById)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])
      vi.mocked(repos.sessions.create).mockImplementation((data) => ({
        ...makeSession(),
        ...data,
      }))

      const result = service.merge('aaa123', 'bbb123')
      expect(result.removedIds).toContain(sessionA.id)
      expect(result.removedIds).toContain(sessionB.id)
      expect(repos.sessions.softDelete).toHaveBeenCalledTimes(2)
      expect(repos.sessions.create).toHaveBeenCalledTimes(1)
      expect(repos.undo.push).toHaveBeenCalledWith('merge', expect.any(Object))
    })

    it('throws without force when gap exceeds threshold', () => {
      const sessionA = makeSession({
        id: 'aaa12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 1000,
        endTime: 3000,
        idleDeductedMs: 0,
      })
      const sessionB = makeSession({
        id: 'bbb12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 3000 + 2 * 60 * 60 * 1000,
        endTime: 3000 + 3 * 60 * 60 * 1000,
        idleDeductedMs: 0,
      })

      vi.mocked(repos.sessions.findByPrefix)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)

      expect(() => service.merge('aaa123', 'bbb123', false)).toThrow(MergeValidationError)
    })

    it('merges with force when gap exceeds threshold', () => {
      const sessionA = makeSession({
        id: 'aaa12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 1000,
        endTime: 3000,
        idleDeductedMs: 0,
      })
      const sessionB = makeSession({
        id: 'bbb12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 3000 + 2 * 60 * 60 * 1000,
        endTime: 3000 + 3 * 60 * 60 * 1000,
        idleDeductedMs: 0,
      })

      vi.mocked(repos.sessions.findByPrefix)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)
      vi.mocked(repos.sessions.findById)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])
      vi.mocked(repos.sessions.create).mockImplementation((data) => ({
        ...makeSession(),
        ...data,
      }))

      const result = service.merge('aaa123', 'bbb123', true)
      expect(result.merged).toBeDefined()
    })

    it('combines notes and deduplicates tags', () => {
      const sessionA = makeSession({
        id: 'aaa12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 1000,
        endTime: 3000,
        idleDeductedMs: 0,
      })
      const sessionB = makeSession({
        id: 'bbb12345-0000-0000-0000-000000000000',
        projectId: 'proj-1',
        startTime: 3000,
        endTime: 5000,
        idleDeductedMs: 0,
      })
      const noteA = makeNote({ sessionId: sessionA.id, content: 'A' })
      const noteB = makeNote({ sessionId: sessionB.id, content: 'B' })
      const tagShared = makeTag({ sessionId: sessionA.id, tag: 'shared' })
      const tagBShared = makeTag({ sessionId: sessionB.id, tag: 'shared' })
      const tagBOnly = makeTag({ sessionId: sessionB.id, tag: 'b-only' })

      vi.mocked(repos.sessions.findByPrefix)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)
      vi.mocked(repos.sessions.findById)
        .mockReturnValueOnce(sessionA)
        .mockReturnValueOnce(sessionB)

      // buildSnapshot calls
      vi.mocked(repos.notes.findBySessionId)
        .mockReturnValueOnce([noteA])  // snapshot A
        .mockReturnValueOnce([noteB])  // snapshot B
        .mockReturnValueOnce([noteA])  // merge - earlier notes
        .mockReturnValueOnce([noteB])  // merge - later notes
      vi.mocked(repos.tags.findBySessionId)
        .mockReturnValueOnce([tagShared])    // snapshot A
        .mockReturnValueOnce([tagBShared, tagBOnly]) // snapshot B
        .mockReturnValueOnce([tagShared])    // merge - earlier tags
        .mockReturnValueOnce([tagBShared, tagBOnly]) // merge - later tags
      vi.mocked(repos.sessions.create).mockImplementation((data) => ({
        ...makeSession(),
        ...data,
      }))

      service.merge('aaa123', 'bbb123')

      // 2 notes created (A and B)
      expect(repos.notes.create).toHaveBeenCalledTimes(2)
      // 2 unique tags: 'shared' and 'b-only' (deduplicated)
      expect(repos.tags.addTag).toHaveBeenCalledTimes(2)
    })
  })
})
