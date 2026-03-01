import { vi } from 'vitest'
import type { Repositories } from '../../../db/repositories/index'
import type { Session, Project, SessionNote, SessionTag, ActivityPulse } from '../../../db/types'

export function makeSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now()
  return {
    id: overrides.id ?? crypto.randomUUID(),
    projectId: overrides.projectId ?? 'proj-1',
    startTime: overrides.startTime ?? now - 3600_000,
    endTime: overrides.endTime ?? undefined as unknown as number | null,
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

export function makeProject(overrides: Partial<Project> = {}): Project {
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

export function makeNote(overrides: Partial<SessionNote> = {}): SessionNote {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? 'session-1',
    content: overrides.content ?? 'test note',
    createdAt: overrides.createdAt ?? Date.now(),
  }
}

export function makeTag(overrides: Partial<SessionTag> = {}): SessionTag {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? 'session-1',
    tag: overrides.tag ?? 'test-tag',
    createdAt: overrides.createdAt ?? Date.now(),
  }
}

export function makePulse(overrides: Partial<ActivityPulse> = {}): ActivityPulse {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? 'session-1',
    terminalId: overrides.terminalId ?? 'term-1',
    sourceType: overrides.sourceType ?? 'shell-hook',
    timestamp: overrides.timestamp ?? Date.now(),
  }
}

export function createMockRepos(): Repositories {
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
      create: vi.fn().mockImplementation((data) => ({ ...data })),
      stop: vi.fn().mockImplementation((id, endTime) => makeSession({ id, endTime })),
      softDelete: vi.fn(),
      attachTerminal: vi.fn(),
      getTerminals: vi.fn().mockReturnValue([]),
      isTerminalAttached: vi.fn().mockReturnValue(false),
      resumeFromIdle: vi.fn().mockImplementation((id, deductionMs) =>
        makeSession({ id, idleDeductedMs: deductionMs }),
      ),
      findLastCompleted: vi.fn(),
      findByPrefix: vi.fn(),
      update: vi.fn(),
      restore: vi.fn(),
      hardDelete: vi.fn(),
      setPausedAt: vi.fn().mockImplementation((id, pausedAt) =>
        makeSession({ id, pausedAt }),
      ),
    },
    pulses: {
      create: vi.fn().mockImplementation((data) => ({ ...data })),
      getLatestForSession: vi.fn(),
      getLatestForTerminal: vi.fn(),
      reassignPulses: vi.fn(),
      findBySessionId: vi.fn().mockReturnValue([]),
    },
    notes: {
      create: vi.fn().mockImplementation((sessionId, content) =>
        makeNote({ sessionId, content }),
      ),
      findBySession: vi.fn().mockReturnValue([]),
      findBySessionId: vi.fn().mockReturnValue([]),
      deleteBySessionId: vi.fn(),
      restoreNote: vi.fn(),
    },
    tags: {
      addTag: vi.fn().mockImplementation((sessionId, tag) =>
        makeTag({ sessionId, tag }),
      ),
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
