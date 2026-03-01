import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRepos, makeSession, makeProject, makeNote, makeTag } from './mock-repos'
import type { Repositories } from '../../../db/repositories/index'

// Mock external dependencies that session-helpers imports
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

import {
  STALE_THRESHOLD_MS,
  STALE_FALLBACK_DURATION_MS,
  PULSE_RATE_LIMIT_MS,
  NOTE_MAX_LENGTH,
  KEBAB_CASE_PATTERN,
  buildIdleConfig,
  resolveActiveSession,
  resolveActiveSessionAny,
  resolveSessionByPrefix,
  buildSnapshot,
} from '../session-helpers'
import { resolveProject, ensureProjectInDb } from '../../../services/project-resolver'
import { SessionNotFoundError, AmbiguousIdError } from '../errors'

describe('constants', () => {
  it('STALE_THRESHOLD_MS is 24 hours', () => {
    expect(STALE_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('STALE_FALLBACK_DURATION_MS is 1 hour', () => {
    expect(STALE_FALLBACK_DURATION_MS).toBe(60 * 60 * 1000)
  })

  it('PULSE_RATE_LIMIT_MS is 60 seconds', () => {
    expect(PULSE_RATE_LIMIT_MS).toBe(60_000)
  })

  it('NOTE_MAX_LENGTH is 10000', () => {
    expect(NOTE_MAX_LENGTH).toBe(10_000)
  })

  it('KEBAB_CASE_PATTERN matches valid kebab-case', () => {
    expect(KEBAB_CASE_PATTERN.test('hello')).toBe(true)
    expect(KEBAB_CASE_PATTERN.test('hello-world')).toBe(true)
    expect(KEBAB_CASE_PATTERN.test('a1-b2')).toBe(true)
  })

  it('KEBAB_CASE_PATTERN rejects invalid strings', () => {
    expect(KEBAB_CASE_PATTERN.test('Hello')).toBe(false)
    expect(KEBAB_CASE_PATTERN.test('hello_world')).toBe(false)
    expect(KEBAB_CASE_PATTERN.test('-leading')).toBe(false)
    expect(KEBAB_CASE_PATTERN.test('trailing-')).toBe(false)
    expect(KEBAB_CASE_PATTERN.test('')).toBe(false)
  })
})

describe('buildIdleConfig', () => {
  it('converts minutes to milliseconds', () => {
    const config = {
      projects: {},
      defaults: { currency: 'USD' },
      idle: { softIdleMinutes: 5, hardIdleMinutes: 15 },
    }
    const result = buildIdleConfig(config)
    expect(result.softIdleMs).toBe(5 * 60 * 1000)
    expect(result.hardIdleMs).toBe(15 * 60 * 1000)
  })
})

describe('resolveActiveSession', () => {
  let repos: Repositories

  beforeEach(() => {
    repos = createMockRepos()
    vi.clearAllMocks()
  })

  it('returns session from project cwd when found', () => {
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
    vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

    const result = resolveActiveSession(repos, '/tmp/test')
    expect(result).toEqual({ session, project })
  })

  it('falls back to single active session when not in project dir', () => {
    const project = makeProject()
    const session = makeSession({ projectId: project.id })

    vi.mocked(resolveProject).mockImplementation(() => {
      throw new Error('not a git repo')
    })
    vi.mocked(repos.sessions.findActiveAll).mockReturnValue([session])
    vi.mocked(repos.projects.findById).mockReturnValue(project)

    const result = resolveActiveSession(repos, '/tmp/unknown')
    expect(result).toEqual({ session, project })
  })

  it('returns undefined when no active sessions', () => {
    vi.mocked(resolveProject).mockImplementation(() => {
      throw new Error('not a git repo')
    })
    vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

    const result = resolveActiveSession(repos, '/tmp/unknown')
    expect(result).toBeUndefined()
  })

  it('returns undefined when multiple active sessions and not in project dir', () => {
    vi.mocked(resolveProject).mockImplementation(() => {
      throw new Error('not a git repo')
    })
    vi.mocked(repos.sessions.findActiveAll).mockReturnValue([
      makeSession(),
      makeSession(),
    ])

    const result = resolveActiveSession(repos, '/tmp/unknown')
    expect(result).toBeUndefined()
  })

  it('returns undefined when single active session has no project', () => {
    const session = makeSession({ projectId: 'nonexistent' })

    vi.mocked(resolveProject).mockImplementation(() => {
      throw new Error('not a git repo')
    })
    vi.mocked(repos.sessions.findActiveAll).mockReturnValue([session])
    vi.mocked(repos.projects.findById).mockReturnValue(undefined)

    const result = resolveActiveSession(repos, '/tmp/unknown')
    expect(result).toBeUndefined()
  })
})

describe('resolveActiveSessionAny', () => {
  let repos: Repositories

  beforeEach(() => {
    repos = createMockRepos()
    vi.clearAllMocks()
  })

  it('returns session from project cwd when found', () => {
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
    vi.mocked(repos.sessions.findActiveByProject).mockReturnValue(session)

    const result = resolveActiveSessionAny(repos, '/tmp/test')
    expect(result).toEqual({ session, project })
  })

  it('returns first active session when multiple exist (unlike resolveActiveSession)', () => {
    const project = makeProject()
    const session1 = makeSession({ projectId: project.id })
    const session2 = makeSession({ projectId: project.id })

    vi.mocked(resolveProject).mockImplementation(() => {
      throw new Error('not a git repo')
    })
    vi.mocked(repos.sessions.findActiveAll).mockReturnValue([session1, session2])
    vi.mocked(repos.projects.findById).mockReturnValue(project)

    const result = resolveActiveSessionAny(repos, '/tmp/unknown')
    expect(result).toEqual({ session: session1, project })
  })

  it('returns undefined when no active sessions', () => {
    vi.mocked(resolveProject).mockImplementation(() => {
      throw new Error('not a git repo')
    })
    vi.mocked(repos.sessions.findActiveAll).mockReturnValue([])

    const result = resolveActiveSessionAny(repos, '/tmp/unknown')
    expect(result).toBeUndefined()
  })
})

describe('resolveSessionByPrefix', () => {
  let repos: Repositories

  beforeEach(() => {
    repos = createMockRepos()
    vi.clearAllMocks()
  })

  it('returns session when found', () => {
    const session = makeSession()
    vi.mocked(repos.sessions.findByPrefix).mockReturnValue(session)

    const result = resolveSessionByPrefix(repos, 'abc123')
    expect(result).toBe(session)
  })

  it('throws SessionNotFoundError on SESSION_NOT_FOUND', () => {
    vi.mocked(repos.sessions.findByPrefix).mockImplementation(() => {
      throw new Error('SESSION_NOT_FOUND:abc123')
    })

    expect(() => resolveSessionByPrefix(repos, 'abc123')).toThrow(SessionNotFoundError)
  })

  it('throws AmbiguousIdError on AMBIGUOUS_ID', () => {
    vi.mocked(repos.sessions.findByPrefix).mockImplementation(() => {
      throw new Error('AMBIGUOUS_ID:abc:abc12345, abc12346')
    })

    expect(() => resolveSessionByPrefix(repos, 'abc')).toThrow(AmbiguousIdError)
  })

  it('rethrows unknown errors', () => {
    vi.mocked(repos.sessions.findByPrefix).mockImplementation(() => {
      throw new Error('database error')
    })

    expect(() => resolveSessionByPrefix(repos, 'abc123')).toThrow('database error')
  })
})

describe('buildSnapshot', () => {
  let repos: Repositories

  beforeEach(() => {
    repos = createMockRepos()
    vi.clearAllMocks()
  })

  it('builds snapshot from session ids', () => {
    const session = makeSession({ id: 's1' })
    const note = makeNote({ sessionId: 's1' })
    const tag = makeTag({ sessionId: 's1' })

    vi.mocked(repos.sessions.findById).mockReturnValue(session)
    vi.mocked(repos.notes.findBySessionId).mockReturnValue([note])
    vi.mocked(repos.tags.findBySessionId).mockReturnValue([tag])

    const result = buildSnapshot(repos, ['s1'])
    expect(result.sessions).toEqual([session])
    expect(result.notes).toEqual([note])
    expect(result.tags).toEqual([tag])
  })

  it('handles multiple session ids', () => {
    const s1 = makeSession({ id: 's1' })
    const s2 = makeSession({ id: 's2' })

    vi.mocked(repos.sessions.findById)
      .mockReturnValueOnce(s1)
      .mockReturnValueOnce(s2)
    vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
    vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

    const result = buildSnapshot(repos, ['s1', 's2'])
    expect(result.sessions).toHaveLength(2)
  })

  it('skips missing sessions', () => {
    vi.mocked(repos.sessions.findById).mockReturnValue(undefined)
    vi.mocked(repos.notes.findBySessionId).mockReturnValue([])
    vi.mocked(repos.tags.findBySessionId).mockReturnValue([])

    const result = buildSnapshot(repos, ['nonexistent'])
    expect(result.sessions).toHaveLength(0)
  })
})
