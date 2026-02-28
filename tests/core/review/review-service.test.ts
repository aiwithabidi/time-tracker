import { describe, it, expect, vi } from 'vitest'
import type { Session, Project, SessionNote, SessionTag } from '../../../src/db/types'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    slug: 'my-project',
    displayName: 'My Project',
    clientName: null,
    hourlyRate: null,
    currency: 'USD',
    gitRemoteUrl: null,
    directoryPath: '/tmp/test-repo',
    isDeleted: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    startTime: 1700000000000,
    endTime: 1700003600000,
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

describe('ReviewService', () => {
  function createMockRepos(options?: {
    sessions?: Session[]
    projects?: Project[]
    notes?: SessionNote[]
    tags?: SessionTag[]
  }) {
    const sessions = options?.sessions ?? [makeSession()]
    const projects = options?.projects ?? [makeProject()]
    const notes = options?.notes ?? []
    const tags = options?.tags ?? []

    return {
      projects: {
        findAll: () => projects,
        findBySlug: (slug: string) => projects.find(p => p.slug === slug),
      },
      sessions: {
        findByDateRange: () => sessions,
      },
      notes: {
        findBySessionId: (sessionId: string) =>
          notes.filter(n => n.sessionId === sessionId),
      },
      tags: {
        findBySessionId: (sessionId: string) =>
          tags.filter(t => t.sessionId === sessionId),
      },
      reviews: {
        create: vi.fn((data: any) => ({
          id: 'review-1',
          title: data.title,
          audience: data.audience,
          content: data.content,
          rawDataJson: data.rawDataJson,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          totalMs: data.totalMs,
          spreadDays: data.spreadDays ?? null,
          projectId: data.projectId ?? null,
          isDeleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })),
        findById: vi.fn(),
        findAll: vi.fn(() => []),
        findByDateRange: vi.fn(() => []),
        findSessionsByReviewId: vi.fn(() => []),
        findGitCommitsByReviewId: vi.fn(() => []),
        softDelete: vi.fn(),
      },
      pulses: {},
      undo: {},
    } as any
  }

  // We need to mock git-reader since we can't control git in tests
  // The service imports git-reader, but gather calls it internally.
  // For unit tests, we test the data flow without hitting real git.

  describe('gather', () => {
    it('returns gathered data with sessions and totals', async () => {
      const session = makeSession({
        startTime: 1700000000000,
        endTime: 1700003600000,
        idleDeductedMs: 0,
      })
      const mockRepos = createMockRepos({
        sessions: [session],
        projects: [makeProject({ directoryPath: undefined })],
      })

      // Dynamic import to allow mocking
      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      const result = service.gather({
        from: 1700000000000,
        to: 1700100000000,
      })

      expect(result.sessions).toHaveLength(1)
      expect(result.sessions[0]!.durationMs).toBe(3600000) // 1 hour
      expect(result.totalMs).toBe(3600000)
      expect(result.periodStart).toBe(1700000000000)
      expect(result.periodEnd).toBe(1700100000000)
    })

    it('enriches sessions with notes and tags', async () => {
      const session = makeSession()
      const note: SessionNote = {
        id: 'note-1',
        sessionId: 'sess-1',
        content: 'Fixed the bug',
        createdAt: 1700001000000,
      }
      const tag: SessionTag = {
        id: 'tag-1',
        sessionId: 'sess-1',
        tag: 'bugfix',
        createdAt: 1700001000000,
      }

      const mockRepos = createMockRepos({
        sessions: [session],
        projects: [makeProject({ directoryPath: undefined })],
        notes: [note],
        tags: [tag],
      })

      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      const result = service.gather({ from: 1700000000000, to: 1700100000000 })

      expect(result.sessions[0]!.notes).toHaveLength(1)
      expect(result.sessions[0]!.notes[0]!.content).toBe('Fixed the bug')
      expect(result.sessions[0]!.tags).toHaveLength(1)
      expect(result.sessions[0]!.tags[0]!.tag).toBe('bugfix')
    })

    it('filters by project slug', async () => {
      const mockRepos = createMockRepos({
        projects: [makeProject({ directoryPath: undefined })],
      })

      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      const result = service.gather({
        from: 1700000000000,
        to: 1700100000000,
        projectSlug: 'my-project',
      })

      expect(result.projectSlug).toBe('my-project')
    })

    it('throws for unknown project slug', async () => {
      const mockRepos = createMockRepos()

      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      expect(() =>
        service.gather({
          from: 1700000000000,
          to: 1700100000000,
          projectSlug: 'nonexistent',
        }),
      ).toThrow('Project "nonexistent" not found')
    })

    it('computes spread when spread option provided', async () => {
      const session = makeSession({
        startTime: 1700000000000,
        endTime: 1700036000000, // ~10 hours
        idleDeductedMs: 0,
      })
      const mockRepos = createMockRepos({
        sessions: [session],
        projects: [makeProject({ directoryPath: undefined })],
      })

      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      const result = service.gather({
        from: 1700000000000,
        to: 1700100000000,
        spread: 5,
      })

      expect(result.spread).toBeDefined()
      expect(result.spread!.spreadDays).toBe(5)
      expect(result.spread!.days).toHaveLength(5)
      // Each day should have roughly equal hours
      const totalAllocated = result.spread!.days.reduce((sum, d) => sum + d.hoursAllocated, 0)
      expect(totalAllocated).toBeCloseTo(result.spread!.totalHours, 1)
    })
  })

  describe('list', () => {
    it('returns reviews from repository', async () => {
      const mockRepos = createMockRepos()
      mockRepos.reviews.findAll.mockReturnValue([
        {
          id: 'rev-1',
          title: 'Week 47 Review',
          audience: 'client',
          content: 'Some content',
          totalMs: 3600000,
          periodStart: 1700000000000,
          periodEnd: 1700100000000,
          createdAt: Date.now(),
        },
      ])

      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      const result = service.list({ limit: 10 })
      expect(result).toHaveLength(1)
      expect(result[0]!.title).toBe('Week 47 Review')
    })
  })

  describe('show', () => {
    it('returns review with session and commit counts', async () => {
      const mockRepos = createMockRepos()
      mockRepos.reviews.findById.mockReturnValue({
        id: 'rev-1',
        title: 'Test Review',
        audience: 'developer',
        content: 'Content here',
        totalMs: 7200000,
      })
      mockRepos.reviews.findSessionsByReviewId.mockReturnValue([
        { id: 'rs-1', reviewId: 'rev-1', sessionId: 'sess-1' },
        { id: 'rs-2', reviewId: 'rev-1', sessionId: 'sess-2' },
      ])
      mockRepos.reviews.findGitCommitsByReviewId.mockReturnValue([
        { id: 'rc-1', reviewId: 'rev-1', hash: 'abc123' },
      ])

      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      const result = service.show('rev-1')
      expect(result).toBeDefined()
      expect(result!.review.title).toBe('Test Review')
      expect(result!.sessionCount).toBe(2)
      expect(result!.commitCount).toBe(1)
    })

    it('returns undefined for nonexistent review', async () => {
      const mockRepos = createMockRepos()
      mockRepos.reviews.findById.mockReturnValue(undefined)

      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      expect(service.show('nonexistent')).toBeUndefined()
    })
  })

  describe('delete', () => {
    it('soft-deletes an existing review', async () => {
      const mockRepos = createMockRepos()
      mockRepos.reviews.findById.mockReturnValue({ id: 'rev-1' })

      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      const result = service.delete('rev-1')
      expect(result).toBe(true)
      expect(mockRepos.reviews.softDelete).toHaveBeenCalledWith('rev-1')
    })

    it('returns false for nonexistent review', async () => {
      const mockRepos = createMockRepos()
      mockRepos.reviews.findById.mockReturnValue(undefined)

      const { createReviewService } = await import('../../../src/core/review/review-service')
      const service = createReviewService({ repos: mockRepos })

      expect(service.delete('nonexistent')).toBe(false)
    })
  })
})
