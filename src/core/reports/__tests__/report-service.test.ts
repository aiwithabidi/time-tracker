import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createReportService } from '../report-service'
import type { Repositories } from '../../../db/repositories/index'
import type { Session, Project } from '../../../db/types'

function makeProject(overrides: Partial<Project> = {}): Project {
  const now = Date.now()
  return {
    id: overrides.id ?? 'proj-1',
    slug: overrides.slug ?? 'test-project',
    displayName: overrides.displayName ?? 'Test Project',
    clientName: overrides.clientName ?? null,
    hourlyRate: overrides.hourlyRate ?? null,
    currency: overrides.currency ?? 'USD',
    gitRemoteUrl: overrides.gitRemoteUrl ?? null,
    directoryPath: overrides.directoryPath ?? '/tmp/test',
    isDeleted: overrides.isDeleted ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now()
  return {
    id: overrides.id ?? crypto.randomUUID(),
    projectId: overrides.projectId ?? 'proj-1',
    startTime: overrides.startTime ?? now - 3600_000,
    endTime: overrides.endTime ?? now,
    timezone: overrides.timezone ?? 'America/New_York',
    source: overrides.source ?? 'manual',
    rateAtTime: overrides.rateAtTime ?? null,
    pausedAt: overrides.pausedAt ?? null,
    idleDeductedMs: overrides.idleDeductedMs ?? 0,
    isDeleted: overrides.isDeleted ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

function createMockRepos(): Repositories {
  return {
    projects: {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findByDirectoryPath: vi.fn(),
      findAll: vi.fn().mockReturnValue([]),
      create: vi.fn(),
      update: vi.fn(),
      upsertFromDirectory: vi.fn(),
    },
    sessions: {
      findActiveByProject: vi.fn(),
      findActiveAll: vi.fn().mockReturnValue([]),
      findById: vi.fn(),
      findByDateRange: vi.fn().mockReturnValue([]),
      create: vi.fn(),
      stop: vi.fn(),
      softDelete: vi.fn(),
      attachTerminal: vi.fn(),
      getTerminals: vi.fn().mockReturnValue([]),
      isTerminalAttached: vi.fn().mockReturnValue(false),
      resumeFromIdle: vi.fn(),
      findLastCompleted: vi.fn(),
      findByPrefix: vi.fn(),
      update: vi.fn(),
      restore: vi.fn(),
      hardDelete: vi.fn(),
      setPausedAt: vi.fn(),
    },
    pulses: {
      create: vi.fn(),
      getLatestForSession: vi.fn(),
      getLatestForTerminal: vi.fn(),
      reassignPulses: vi.fn(),
      findBySessionId: vi.fn().mockReturnValue([]),
    },
    notes: {
      create: vi.fn(),
      findBySession: vi.fn().mockReturnValue([]),
      findBySessionId: vi.fn().mockReturnValue([]),
      deleteBySessionId: vi.fn(),
      restoreNote: vi.fn(),
    },
    tags: {
      addTag: vi.fn(),
      removeTag: vi.fn(),
      findBySession: vi.fn().mockReturnValue([]),
      findBySessionId: vi.fn().mockReturnValue([]),
      deleteBySessionId: vi.fn(),
      restoreTag: vi.fn(),
    },
    undo: {
      push: vi.fn(),
      pop: vi.fn(),
    },
    reviews: {
      create: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn().mockReturnValue([]),
      addSession: vi.fn(),
      addGitCommit: vi.fn(),
      findSessionsByReview: vi.fn().mockReturnValue([]),
      findGitCommitsByReview: vi.fn().mockReturnValue([]),
    },
  } as unknown as Repositories
}

describe('createReportService', () => {
  let repos: Repositories
  let service: ReturnType<typeof createReportService>

  beforeEach(() => {
    repos = createMockRepos()
    service = createReportService({ repos })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('today', () => {
    it('returns empty summary when no sessions', () => {
      vi.mocked(repos.projects.findAll).mockReturnValue([])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue([])
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

      const result = service.today()
      expect(result.projects).toHaveLength(0)
      expect(result.grandTotalMs).toBe(0)
      expect(result.activeSession).toBeUndefined()
    })

    it('aggregates sessions by project', () => {
      const project = makeProject()
      const now = Date.now()
      const sessions = [
        makeSession({ projectId: project.id, startTime: now - 7200_000, endTime: now - 3600_000 }),
        makeSession({ projectId: project.id, startTime: now - 3600_000, endTime: now }),
      ]

      vi.mocked(repos.projects.findAll).mockReturnValue([project])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue(sessions)
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

      const result = service.today()
      expect(result.projects).toHaveLength(1)
      expect(result.projects[0]!.sessionCount).toBe(2)
      expect(result.grandTotalMs).toBeGreaterThan(0)
    })

    it('detects active session', () => {
      const project = makeProject()
      const now = Date.now()
      const activeSession = makeSession({
        projectId: project.id,
        startTime: now - 3600_000,
        endTime: null,
      })

      vi.mocked(repos.projects.findAll).mockReturnValue([project])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue([])
      vi.mocked(repos.sessions.findActiveAll).mockReturnValue([activeSession])

      const result = service.today()
      expect(result.activeSession).toBeDefined()
      expect(result.activeSession!.project.id).toBe(project.id)
    })
  })

  describe('week', () => {
    it('returns empty summary', () => {
      vi.mocked(repos.projects.findAll).mockReturnValue([])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue([])

      const result = service.week()
      expect(result.projects).toHaveLength(0)
      expect(result.grandTotalMs).toBe(0)
    })

    it('filters by project slug', () => {
      const project = makeProject({ slug: 'my-proj' })
      vi.mocked(repos.projects.findBySlug).mockReturnValue(project)
      vi.mocked(repos.projects.findAll).mockReturnValue([project])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue([])

      const result = service.week('my-proj')
      expect(repos.sessions.findByDateRange).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        project.id,
      )
    })

    it('throws for unknown project', () => {
      vi.mocked(repos.projects.findBySlug).mockReturnValue(undefined)

      expect(() => service.week('nonexistent')).toThrow('not found')
    })
  })

  describe('log', () => {
    it('returns day groups sorted by date descending', () => {
      const project = makeProject()
      const now = Date.now()
      const sessions = [
        makeSession({ projectId: project.id, startTime: now - 86400_000, endTime: now - 86400_000 + 3600_000 }),
        makeSession({ projectId: project.id, startTime: now - 3600_000, endTime: now }),
      ]

      vi.mocked(repos.projects.findAll).mockReturnValue([project])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue(sessions)

      const result = service.log()
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('filters by project slug', () => {
      const project = makeProject({ slug: 'my-proj' })
      vi.mocked(repos.projects.findBySlug).mockReturnValue(project)
      vi.mocked(repos.projects.findAll).mockReturnValue([project])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue([])

      service.log({ projectSlug: 'my-proj' })
      expect(repos.sessions.findByDateRange).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        project.id,
      )
    })

    it('throws for unknown project', () => {
      vi.mocked(repos.projects.findBySlug).mockReturnValue(undefined)

      expect(() => service.log({ projectSlug: 'nonexistent' })).toThrow('not found')
    })

    it('throws for invalid from date', () => {
      vi.mocked(repos.projects.findAll).mockReturnValue([])

      expect(() => service.log({ from: 'not-a-date' })).toThrow('Invalid --from date')
    })

    it('throws for invalid to date', () => {
      vi.mocked(repos.projects.findAll).mockReturnValue([])

      expect(() => service.log({ to: 'not-a-date' })).toThrow('Invalid --to date')
    })
  })

  describe('last', () => {
    it('returns null when no completed sessions', () => {
      vi.mocked(repos.sessions.findLastCompleted).mockReturnValue(undefined)

      const result = service.last()
      expect(result).toBeNull()
    })

    it('returns last completed session with project', () => {
      const project = makeProject()
      const session = makeSession({ projectId: project.id, endTime: Date.now() })

      vi.mocked(repos.sessions.findLastCompleted).mockReturnValue(session)
      vi.mocked(repos.projects.findAll).mockReturnValue([project])

      const result = service.last()
      expect(result).not.toBeNull()
      expect(result!.session).toBe(session)
      expect(result!.project).toBe(project)
    })

    it('returns null when project not found', () => {
      const session = makeSession({ projectId: 'missing-proj' })
      vi.mocked(repos.sessions.findLastCompleted).mockReturnValue(session)
      vi.mocked(repos.projects.findAll).mockReturnValue([])

      const result = service.last()
      expect(result).toBeNull()
    })
  })

  describe('allProjects', () => {
    it('returns all projects with session counts', () => {
      const projectA = makeProject({ id: 'p1', slug: 'proj-a' })
      const projectB = makeProject({ id: 'p2', slug: 'proj-b' })

      vi.mocked(repos.projects.findAll).mockReturnValue([projectA, projectB])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue([
        makeSession({ projectId: 'p1' }),
      ])

      const result = service.allProjects()
      expect(result).toHaveLength(2)
      const pA = result.find(p => p.project.slug === 'proj-a')
      const pB = result.find(p => p.project.slug === 'proj-b')
      expect(pA!.sessionCount).toBe(1)
      expect(pB!.sessionCount).toBe(0)
    })

    it('sorts by totalMs descending', () => {
      const projectA = makeProject({ id: 'p1', slug: 'proj-a' })
      const projectB = makeProject({ id: 'p2', slug: 'proj-b' })
      const now = Date.now()

      vi.mocked(repos.projects.findAll).mockReturnValue([projectA, projectB])
      vi.mocked(repos.sessions.findByDateRange).mockReturnValue([
        makeSession({ projectId: 'p1', startTime: now - 1000, endTime: now }),
        makeSession({ projectId: 'p2', startTime: now - 10000, endTime: now }),
      ])

      const result = service.allProjects()
      expect(result[0]!.totalMs).toBeGreaterThanOrEqual(result[1]!.totalMs)
    })
  })
})
