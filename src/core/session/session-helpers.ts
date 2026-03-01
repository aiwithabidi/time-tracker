import type { Repositories } from '../../db/repositories/index'
import type { Session, Project, SessionNote, SessionTag } from '../../db/types'
import { resolveProject, ensureProjectInDb, type ResolvedProject } from '../../services/project-resolver'
import {
  NoActiveSessionError,
  NoProjectFoundError,
  SessionNotFoundError,
  AmbiguousIdError,
} from './errors'
import type { UndoSnapshot } from '../../db/repositories/undo-repository'
import { loadConfig } from '../../config/config-loader'
import type { Config } from '../../config/types'
import type { IdleConfig } from './idle-detector'

export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000
export const STALE_FALLBACK_DURATION_MS = 60 * 60 * 1000
export const PULSE_RATE_LIMIT_MS = 60_000
export const NOTE_MAX_LENGTH = 10_000
export const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function buildIdleConfig(config: Config): IdleConfig {
  return {
    softIdleMs: config.idle.softIdleMinutes * 60 * 1000,
    hardIdleMs: config.idle.hardIdleMinutes * 60 * 1000,
  }
}

export function loadIdleConfig(): { config: Config; idleConfig: IdleConfig } {
  const config = loadConfig()
  const idleConfig = buildIdleConfig(config)
  return { config, idleConfig }
}

export function resolveAndEnsureProject(
  repos: Repositories,
  cwd: string,
  projectOverride?: string,
): { resolved: ResolvedProject; project: Project } {
  if (projectOverride) {
    const existing = repos.projects.findBySlug(projectOverride)
    if (existing) {
      return {
        resolved: {
          slug: existing.slug,
          displayName: existing.displayName,
          directoryPath: existing.directoryPath ?? cwd,
          source: 'alias',
          currency: existing.currency ?? 'USD',
        },
        project: existing,
      }
    }
    throw new NoProjectFoundError(
      cwd,
      `Project "${projectOverride}" not found. Check the slug or start from a project directory.`,
    )
  }

  let resolved: ResolvedProject
  try {
    resolved = resolveProject(cwd)
  } catch {
    throw new NoProjectFoundError(
      cwd,
      "Run from a git repo or configure an alias with: tt alias add",
    )
  }

  const project = ensureProjectInDb(resolved, repos.projects)
  return { resolved, project }
}

/**
 * Resolve the active session for the current context.
 * Tries to find session by project (from cwd), then falls back to any single active session.
 * Returns undefined if no active session is found (caller decides whether to throw).
 */
export function resolveActiveSession(
  repos: Repositories,
  cwd: string,
): { session: Session; project: Project } | undefined {
  try {
    const resolved = resolveProject(cwd)
    const dbProject = ensureProjectInDb(resolved, repos.projects)
    const activeSession = repos.sessions.findActiveByProject(dbProject.id)
    if (activeSession) {
      return { session: activeSession, project: dbProject }
    }
  } catch {
    // Not in a project directory, fall through
  }

  const allActive = repos.sessions.findActiveAll()
  if (allActive.length === 1) {
    const session = allActive[0]!
    const project = repos.projects.findById(session.projectId)
    if (project) {
      return { session, project }
    }
  }

  return undefined
}

/**
 * Resolve the active session, preferring any active (including multiple).
 * Used by commands that just need "the" active session (now, away, back).
 */
export function resolveActiveSessionAny(
  repos: Repositories,
  cwd: string,
): { session: Session; project: Project } | undefined {
  try {
    const resolved = resolveProject(cwd)
    const dbProject = ensureProjectInDb(resolved, repos.projects)
    const activeSession = repos.sessions.findActiveByProject(dbProject.id)
    if (activeSession) {
      return { session: activeSession, project: dbProject }
    }
  } catch {
    // Not in a project directory, fall through
  }

  const allActive = repos.sessions.findActiveAll()
  if (allActive.length > 0) {
    const session = allActive[0]!
    const project = repos.projects.findById(session.projectId)
    if (project) {
      return { session, project }
    }
  }

  return undefined
}

export function resolveSessionByPrefix(repos: Repositories, prefix: string): Session {
  try {
    return repos.sessions.findByPrefix(prefix)
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.startsWith('SESSION_NOT_FOUND:')) {
        throw new SessionNotFoundError(prefix)
      }
      if (err.message.startsWith('AMBIGUOUS_ID:')) {
        const parts = err.message.split(':')
        const candidates = (parts[2] ?? '').split(', ')
        throw new AmbiguousIdError(prefix, candidates)
      }
    }
    throw err
  }
}

export function buildSnapshot(repos: Repositories, sessionIds: string[]): UndoSnapshot {
  const snapshotSessions: Session[] = []
  const snapshotNotes: SessionNote[] = []
  const snapshotTags: SessionTag[] = []

  for (const id of sessionIds) {
    const session = repos.sessions.findById(id)
    if (session) snapshotSessions.push(session)
    snapshotNotes.push(...repos.notes.findBySessionId(id))
    snapshotTags.push(...repos.tags.findBySessionId(id))
  }

  return { sessions: snapshotSessions, notes: snapshotNotes, tags: snapshotTags }
}
