import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockRepos, makeSession, makeProject, makePulse } from './mock-repos'
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

import { createPulseService } from '../pulse-service'
import { resolveProject, ensureProjectInDb } from '../../../services/project-resolver'
import { STALE_THRESHOLD_MS, STALE_FALLBACK_DURATION_MS, PULSE_RATE_LIMIT_MS } from '../session-helpers'

describe('createPulseService', () => {
  let repos: Repositories
  let service: ReturnType<typeof createPulseService>

  beforeEach(() => {
    repos = createMockRepos()
    service = createPulseService({ repos })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('closeStaleSession', () => {
    it('returns undefined if session is not stale (recent pulse)', () => {
      const session = makeSession({ id: 's1', startTime: Date.now() - 60_000 })
      const pulse = makePulse({ sessionId: 's1', timestamp: Date.now() - 1000 })
      vi.mocked(repos.pulses.getLatestForSession).mockReturnValue(pulse)

      const result = service.closeStaleSession(session)
      expect(result).toBeUndefined()
      expect(repos.sessions.stop).not.toHaveBeenCalled()
    })

    it('closes stale session using latest pulse timestamp', () => {
      const startTime = Date.now() - STALE_THRESHOLD_MS - 120_000
      const pulseTimestamp = Date.now() - STALE_THRESHOLD_MS - 60_000
      const session = makeSession({ id: 's1', startTime, idleDeductedMs: 0 })
      const pulse = makePulse({ sessionId: 's1', timestamp: pulseTimestamp })

      vi.mocked(repos.pulses.getLatestForSession).mockReturnValue(pulse)

      const result = service.closeStaleSession(session)
      expect(result).toBeDefined()
      expect(repos.sessions.stop).toHaveBeenCalledWith('s1', pulseTimestamp)
      expect(result!.id).toBe('s1')
      expect(result!.duration).toBe(pulseTimestamp - startTime)
    })

    it('uses fallback duration when no pulse exists', () => {
      const startTime = Date.now() - STALE_THRESHOLD_MS - 60_000
      const session = makeSession({ id: 's1', startTime, idleDeductedMs: 0 })

      vi.mocked(repos.pulses.getLatestForSession).mockReturnValue(undefined)

      const result = service.closeStaleSession(session)
      expect(result).toBeDefined()
      expect(repos.sessions.stop).toHaveBeenCalledWith(
        's1',
        startTime + STALE_FALLBACK_DURATION_MS,
      )
    })

    it('clamps duration to 0 when idle exceeds duration', () => {
      const startTime = Date.now() - STALE_THRESHOLD_MS - 60_000
      const pulseTimestamp = startTime + 1000
      const session = makeSession({
        id: 's1',
        startTime,
        idleDeductedMs: 999_999_999,
      })
      const pulse = makePulse({ sessionId: 's1', timestamp: pulseTimestamp })

      vi.mocked(repos.pulses.getLatestForSession).mockReturnValue(pulse)

      const result = service.closeStaleSession(session)
      expect(result!.duration).toBe(0)
    })
  })

  describe('pulse', () => {
    it('returns rate-limited when project resolution fails', () => {
      vi.mocked(resolveProject).mockImplementation(() => {
        throw new Error('no project')
      })

      const result = service.pulse({
        cwd: '/tmp/unknown',
        source: 'shell-hook',
        terminalId: 'term-1',
      })

      expect(result.action).toBe('rate-limited')
    })

    it('returns rate-limited when last pulse is within threshold', () => {
      const project = makeProject()
      vi.mocked(resolveProject).mockReturnValue({
        slug: project.slug,
        displayName: project.displayName,
        directoryPath: '/tmp/test',
        source: 'git',
        currency: 'USD',
      })
      vi.mocked(ensureProjectInDb).mockReturnValue(project)

      const recentPulse = makePulse({ timestamp: Date.now() - 10_000 })
      vi.mocked(repos.pulses.getLatestForTerminal).mockReturnValue(recentPulse)

      const result = service.pulse({
        cwd: '/tmp/test',
        source: 'shell-hook',
        terminalId: 'term-1',
      })

      expect(result.action).toBe('rate-limited')
    })

    it('creates new session when none active for project', () => {
      const project = makeProject()
      vi.mocked(resolveProject).mockReturnValue({
        slug: project.slug,
        displayName: project.displayName,
        directoryPath: '/tmp/test',
        source: 'git',
        currency: 'USD',
      })
      vi.mocked(ensureProjectInDb).mockReturnValue(project)
      vi.mocked(repos.pulses.getLatestForTerminal).mockReturnValue(undefined)
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(undefined)
      vi.mocked(repos.sessions.create).mockImplementation((data) => ({
        ...makeSession(),
        ...data,
      }))

      const result = service.pulse({
        cwd: '/tmp/test',
        source: 'shell-hook',
        terminalId: 'term-1',
      })

      expect(result.action).toBe('created')
      expect(repos.sessions.create).toHaveBeenCalled()
      expect(repos.sessions.attachTerminal).toHaveBeenCalled()
      expect(repos.pulses.create).toHaveBeenCalled()
    })

    it('attaches terminal to existing session', () => {
      const project = makeProject()
      const session = makeSession({ projectId: project.id })
      vi.mocked(resolveProject).mockReturnValue({
        slug: project.slug,
        displayName: project.displayName,
        directoryPath: '/tmp/test',
        source: 'git',
        currency: 'USD',
      })
      vi.mocked(ensureProjectInDb).mockReturnValue(project)
      vi.mocked(repos.pulses.getLatestForTerminal).mockReturnValue(undefined)
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)
      vi.mocked(repos.sessions.isTerminalAttached).mockReturnValue(false)
      vi.mocked(repos.pulses.getLatestForSession).mockReturnValue(undefined)

      const result = service.pulse({
        cwd: '/tmp/test',
        source: 'shell-hook',
        terminalId: 'term-2',
      })

      expect(result.action).toBe('attached')
      expect(repos.sessions.attachTerminal).toHaveBeenCalledWith(session.id, 'term-2')
    })

    it('records pulse on already-attached terminal', () => {
      const project = makeProject()
      const session = makeSession({ projectId: project.id })
      vi.mocked(resolveProject).mockReturnValue({
        slug: project.slug,
        displayName: project.displayName,
        directoryPath: '/tmp/test',
        source: 'git',
        currency: 'USD',
      })
      vi.mocked(ensureProjectInDb).mockReturnValue(project)
      vi.mocked(repos.pulses.getLatestForTerminal).mockReturnValue(undefined)
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)
      vi.mocked(repos.sessions.isTerminalAttached).mockReturnValue(true)
      vi.mocked(repos.pulses.getLatestForSession).mockReturnValue(undefined)

      const result = service.pulse({
        cwd: '/tmp/test',
        source: 'shell-hook',
        terminalId: 'term-1',
      })

      expect(result.action).toBe('pulsed')
      expect(repos.pulses.create).toHaveBeenCalled()
    })

    it('closes stale sessions before creating new one', () => {
      const project = makeProject()
      const staleSession = makeSession({
        id: 'stale-1',
        startTime: Date.now() - STALE_THRESHOLD_MS - 120_000,
      })

      vi.mocked(resolveProject).mockReturnValue({
        slug: project.slug,
        displayName: project.displayName,
        directoryPath: '/tmp/test',
        source: 'git',
        currency: 'USD',
      })
      vi.mocked(ensureProjectInDb).mockReturnValue(project)
      vi.mocked(repos.pulses.getLatestForTerminal).mockReturnValue(undefined)
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([staleSession])
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(undefined)
      vi.mocked(repos.pulses.getLatestForSession).mockReturnValue(undefined)
      vi.mocked(repos.sessions.create).mockImplementation((data) => ({
        ...makeSession(),
        ...data,
      }))

      service.pulse({
        cwd: '/tmp/test',
        source: 'shell-hook',
        terminalId: 'term-1',
      })

      expect(repos.sessions.stop).toHaveBeenCalled()
    })

    it('deducts idle time when hard-idle detected', () => {
      const project = makeProject()
      const now = Date.now()
      const session = makeSession({
        projectId: project.id,
        startTime: now - 3600_000,
        pausedAt: null,
      })
      // Last pulse was 25 minutes ago (hard idle threshold is 20 min)
      const lastPulse = makePulse({
        sessionId: session.id,
        timestamp: now - 25 * 60 * 1000,
      })

      vi.mocked(resolveProject).mockReturnValue({
        slug: project.slug,
        displayName: project.displayName,
        directoryPath: '/tmp/test',
        source: 'git',
        currency: 'USD',
      })
      vi.mocked(ensureProjectInDb).mockReturnValue(project)
      vi.mocked(repos.pulses.getLatestForTerminal).mockReturnValue(undefined)
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])
      vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)
      vi.mocked(repos.sessions.isTerminalAttached).mockReturnValue(true)
      vi.mocked(repos.pulses.getLatestForSession).mockReturnValue(lastPulse)

      service.pulse({
        cwd: '/tmp/test',
        source: 'shell-hook',
        terminalId: 'term-1',
      })

      expect(repos.sessions.resumeFromIdle).toHaveBeenCalled()
    })
  })
})
