import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockRepos, makeSession, makeProject, makePulse } from './mock-repos'
import type { Repositories } from '../../../db/repositories/index'

// Mock external dependencies
vi.mock('../../../services/project-resolver', () => ({
  resolveProject: vi.fn(),
  ensureProjectInDb: vi.fn(),
}))

vi.mock('../../../config/config-loader', () => ({
  loadConfig: vi.fn().mockReturnValue({
    projects: {},
    defaults: { currency: 'USD' },
    idle: { softIdleMinutes: 8, hardIdleMinutes: 20 },
  }),
}))

import { createLifecycleService } from '../lifecycle-service'
import { resolveProject, ensureProjectInDb } from '../../../services/project-resolver'
import { NoActiveSessionError } from '../errors'

function createMockPulseService() {
  return {
    closeStaleSession: vi.fn(),
    pulse: vi.fn(),
  }
}

describe('createLifecycleService', () => {
  let repos: Repositories
  let pulseService: ReturnType<typeof createMockPulseService>
  let service: ReturnType<typeof createLifecycleService>

  beforeEach(() => {
    repos = createMockRepos()
    pulseService = createMockPulseService()
    service = createLifecycleService({ repos, pulseService })
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

  describe('start', () => {
    it('creates a new session when none active', () => {
      const project = setupProjectResolution()
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(undefined)
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])
      vi.mocked(repos.sessions.create).mockImplementation((data) => ({
        ...makeSession(),
        ...data,
      }))

      const result = service.start('/tmp/test', 'term-1')

      expect(result.action).toBe('created')
      expect(repos.sessions.create).toHaveBeenCalled()
      expect(repos.sessions.attachTerminal).toHaveBeenCalled()
      expect(repos.undo.push).toHaveBeenCalledWith('start', expect.any(Object))
    })

    it('returns already_active when session exists and terminal is attached', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)
      vi.mocked(repos.sessions.isTerminalAttached).mockReturnValue(true)
      pulseService.closeStaleSession.mockReturnValue(undefined)

      const result = service.start('/tmp/test', 'term-1')

      expect(result.action).toBe('already_active')
      expect(result.session).toBe(session)
    })

    it('attaches terminal when session exists but terminal is not attached', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)
      vi.mocked(repos.sessions.isTerminalAttached).mockReturnValue(false)
      pulseService.closeStaleSession.mockReturnValue(undefined)

      const result = service.start('/tmp/test', 'term-2')

      expect(result.action).toBe('attached')
      expect(repos.sessions.attachTerminal).toHaveBeenCalledWith(session.id, 'term-2')
    })

    it('creates new session after closing stale one', () => {
      const project = setupProjectResolution()
      const staleSession = makeSession({ projectId: project.id })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(staleSession)
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])
      pulseService.closeStaleSession.mockReturnValue({ id: staleSession.id, duration: 3600_000 })
      vi.mocked(repos.sessions.create).mockImplementation((data) => ({
        ...makeSession(),
        ...data,
      }))

      const result = service.start('/tmp/test', 'term-1')

      expect(result.action).toBe('created')
      expect(result.staleSessionClosed).toBeDefined()
      expect(result.staleSessionClosed!.id).toBe(staleSession.id)
    })
  })

  describe('stop', () => {
    it('stops an active session by project', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id, endTime: null })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)
      vi.mocked(repos.sessions.stop).mockReturnValue(
        makeSession({ ...session, endTime: now }),
      )

      const result = service.stop('/tmp/test', 'term-1')

      expect(result.session.endTime).toBe(now)
      expect(result.project).toBe(project)
      expect(repos.undo.push).toHaveBeenCalledWith('stop', expect.any(Object))
    })

    it('stops single active session when not in project dir', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('not a git repo')
      })

      const project = makeProject()
      const session = makeSession({ projectId: project.id, endTime: null })
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([session])
      vi.mocked(repos.projects.findById).mockReturnValue(project)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)
      vi.mocked(repos.sessions.stop).mockReturnValue(
        makeSession({ ...session, endTime: now }),
      )

      const result = service.stop('/tmp/unknown', 'term-1')
      expect(result.project).toBe(project)
    })

    it('throws NoActiveSessionError when no sessions active', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

      expect(() => service.stop('/tmp/unknown', 'term-1')).toThrow(NoActiveSessionError)
    })

    it('throws NoActiveSessionError when multiple sessions active', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([
        makeSession(),
        makeSession(),
      ])

      expect(() => service.stop('/tmp/unknown', 'term-1')).toThrow(NoActiveSessionError)
    })

    it('stops by project override', () => {
      const project = makeProject({ slug: 'my-proj' })
      const session = makeSession({ projectId: project.id, endTime: null })
      vi.mocked(repos.projects.findBySlug).mockReturnValue(project)
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)
      vi.mocked(repos.sessions.findById).mockReturnValue(session)
      vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
      vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)
      vi.mocked(repos.sessions.stop).mockReturnValue(
        makeSession({ ...session, endTime: now }),
      )

      const result = service.stop('/tmp/test', 'term-1', { projectOverride: 'my-proj' })
      expect(result.project).toBe(project)
    })
  })

  describe('now', () => {
    it('returns active session info', () => {
      const project = setupProjectResolution()
      const now = Date.now()
      const session = makeSession({
        projectId: project.id,
        startTime: now - 3600_000,
        endTime: null,
        idleDeductedMs: 0,
      })

      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue([session])
      vi.mocked(repos.pulses.getLatestForSession).mockReturnValue(
        makePulse({ timestamp: now - 60_000 }),
      )

      const result = service.now('/tmp/test')
      expect(result.session).toBe(session)
      expect(result.project).toBe(project)
      expect(result.durationMs).toBeGreaterThan(0)
    })

    it('returns null session when none active', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue([])

      const result = service.now('/tmp/unknown')
      expect(result.session).toBeNull()
      expect(result.project).toBeNull()
      expect(result.durationMs).toBe(0)
    })
  })

  describe('away', () => {
    it('pauses an active session', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id, pausedAt: null })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

      const result = service.away('/tmp/test')
      expect(result.action).toBe('paused')
      expect(repos.sessions.setPausedAt).toHaveBeenCalledWith(session.id, expect.any(Number))
    })

    it('returns already_paused when session is paused', () => {
      const project = setupProjectResolution()
      const pausedAt = Date.now() - 60_000
      const session = makeSession({ projectId: project.id, pausedAt })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

      const result = service.away('/tmp/test')
      expect(result.action).toBe('already_paused')
      expect(result.pauseDurationMs).toBeGreaterThan(0)
    })

    it('throws NoActiveSessionError when no active session', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

      expect(() => service.away('/tmp/unknown')).toThrow(NoActiveSessionError)
    })
  })

  describe('back', () => {
    it('resumes a paused session', () => {
      const project = setupProjectResolution()
      const pausedAt = Date.now() - 300_000
      const session = makeSession({ projectId: project.id, pausedAt })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

      const result = service.back('/tmp/test', 'term-1')
      expect(result.breakDurationMs).toBeGreaterThanOrEqual(300_000)
      expect(repos.sessions.resumeFromIdle).toHaveBeenCalled()
      expect(repos.pulses.create).toHaveBeenCalled()
    })

    it('throws when session is not paused', () => {
      const project = setupProjectResolution()
      const session = makeSession({ projectId: project.id, pausedAt: null })
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

      expect(() => service.back('/tmp/test', 'term-1')).toThrow(NoActiveSessionError)
    })

    it('throws when no active session', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('not a git repo')
      })
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

      expect(() => service.back('/tmp/unknown', 'term-1')).toThrow(NoActiveSessionError)
    })
  })
})
