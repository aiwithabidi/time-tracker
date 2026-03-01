import type { Repositories } from '../../db/repositories/index'
import type { Session, Project } from '../../db/types'
import { resolveProject, ensureProjectInDb, type ResolvedProject } from '../../services/project-resolver'
import {
  NoActiveSessionError,
  NoProjectFoundError,
  InvalidTagError,
  SessionNotFoundError,
  AmbiguousIdError,
  NothingToUndoError,
  InvalidTimeRangeError,
  InvalidSplitTimeError,
  MergeValidationError,
} from './errors'
import type {
  SessionStartResult,
  SessionStopResult,
  SessionNowResult,
  SessionStartOptions,
  SessionStopOptions,
  PulseOptions,
  PulseResult,
  AwayResult,
  BackResult,
  EditOptions,
  EditResult,
  UndoResult,
  SplitPreview,
  SplitResult,
  MergePreview,
  MergeResult,
} from './types'
import type { SessionNote, SessionTag } from '../../db/types'
import type { UndoSnapshot } from '../../db/repositories/undo-repository'
import { parseEditTime } from '../../cli/time-parsing'
import { withTransaction } from '../../db/client'
import { computeIdleState, computeIdleDeduction, type IdleConfig } from './idle-detector'
import { loadConfig } from '../../config/config-loader'

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000
const STALE_FALLBACK_DURATION_MS = 60 * 60 * 1000
const PULSE_RATE_LIMIT_MS = 60_000
const NOTE_MAX_LENGTH = 10_000
const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface SessionServiceDeps {
  readonly repos: Repositories
}

function getStartOfToday(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function computeSessionDuration(session: Session): number {
  const end = session.endTime ?? Date.now()
  return Math.max(0, end - session.startTime - session.idleDeductedMs)
}

function loadIdleConfig(): IdleConfig {
  const config = loadConfig()
  return {
    softIdleMs: config.idle.softIdleMinutes * 60 * 1000,
    hardIdleMs: config.idle.hardIdleMinutes * 60 * 1000,
  }
}

export function createSessionService(deps: SessionServiceDeps) {
  const { repos } = deps

  function resolveAndEnsureProject(
    cwd: string,
    projectOverride?: string,
  ): { resolved: ResolvedProject; project: Project } {
    let resolved: ResolvedProject

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

  function closeStaleSession(session: Session): { id: string; duration: number } | undefined {
    const latestPulse = repos.pulses.getLatestForSession(session.id)
    const lastActivity = latestPulse?.timestamp ?? session.startTime

    const timeSinceActivity = Date.now() - lastActivity
    if (timeSinceActivity <= STALE_THRESHOLD_MS) {
      return undefined
    }

    const endTime = latestPulse
      ? latestPulse.timestamp
      : session.startTime + STALE_FALLBACK_DURATION_MS

    repos.sessions.stop(session.id, endTime)
    const duration = endTime - session.startTime - session.idleDeductedMs

    return { id: session.id, duration: Math.max(0, duration) }
  }

  function getTodayStats(projectId?: string): { totalMs: number; sessionCount: number } {
    const startOfToday = getStartOfToday()
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000

    const todaySessions = repos.sessions.findByDateRange(startOfToday, endOfToday, projectId)

    let totalMs = 0
    let sessionCount = 0

    for (const s of todaySessions) {
      totalMs += computeSessionDuration(s)
      sessionCount += 1
    }

    return { totalMs, sessionCount }
  }

  function resolveSessionByPrefix(prefix: string): Session {
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

  function splitIdleDeducted(
    originalIdleMs: number,
    totalWallMs: number,
    wallAMs: number,
  ): { idleA: number; idleB: number } {
    if (totalWallMs === 0) return { idleA: 0, idleB: 0 }
    const idleA = Math.max(0, Math.round(originalIdleMs * (wallAMs / totalWallMs)))
    const idleB = Math.max(0, originalIdleMs - idleA)
    return { idleA, idleB }
  }

  function previewSplitInternal(sessionPrefix: string, splitTimeInput: string): SplitPreview {
    const session = resolveSessionByPrefix(sessionPrefix)

    if (!session.endTime) {
      throw new InvalidTimeRangeError('Cannot split an active session. Stop it first.')
    }

    const splitMs = parseEditTime(splitTimeInput, session.startTime)

    if (splitMs <= session.startTime || splitMs >= session.endTime) {
      throw new InvalidSplitTimeError(splitMs, session.startTime, session.endTime)
    }

    const totalWall = session.endTime - session.startTime
    const wallA = splitMs - session.startTime
    const wallB = session.endTime - splitMs
    const { idleA, idleB } = splitIdleDeducted(session.idleDeductedMs, totalWall, wallA)

    return {
      original: session,
      sessionA: {
        startTime: session.startTime,
        endTime: splitMs,
        durationMs: Math.max(0, wallA - idleA),
        idleDeductedMs: idleA,
      },
      sessionB: {
        startTime: splitMs,
        endTime: session.endTime,
        durationMs: Math.max(0, wallB - idleB),
        idleDeductedMs: idleB,
      },
    }
  }

  function previewMergeInternal(prefixA: string, prefixB: string): MergePreview {
    const sessionA = resolveSessionByPrefix(prefixA)
    const sessionB = resolveSessionByPrefix(prefixB)

    if (!sessionA.endTime) {
      throw new MergeValidationError(`Session ${prefixA} is still active. Stop it first.`)
    }
    if (!sessionB.endTime) {
      throw new MergeValidationError(`Session ${prefixB} is still active. Stop it first.`)
    }

    if (sessionA.projectId !== sessionB.projectId) {
      throw new MergeValidationError(
        'Sessions belong to different projects. Reassign with "tt edit <id> --project <slug>" first.'
      )
    }

    const [earlier, later] = sessionA.startTime <= sessionB.startTime
      ? [sessionA, sessionB]
      : [sessionB, sessionA]

    const gapMs = Math.max(0, later.startTime - earlier.endTime!)

    const FORCE_GAP_THRESHOLD_MS = 60 * 60 * 1000
    const requiresForce = gapMs > FORCE_GAP_THRESHOLD_MS

    const mergedIdleMs = earlier.idleDeductedMs + later.idleDeductedMs + gapMs
    const mergedStartTime = earlier.startTime
    const mergedEndTime = later.endTime!
    const mergedDurationMs = Math.max(0, mergedEndTime - mergedStartTime - mergedIdleMs)

    return {
      earlier,
      later,
      gapMs,
      merged: {
        startTime: mergedStartTime,
        endTime: mergedEndTime,
        durationMs: mergedDurationMs,
        idleDeductedMs: mergedIdleMs,
      },
      requiresForce,
    }
  }

  function buildSnapshot(sessionIds: string[]): UndoSnapshot {
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

  return {
    start(cwd: string, terminalId: string, options?: SessionStartOptions): SessionStartResult {
      const { resolved, project } = resolveAndEnsureProject(cwd, options?.projectOverride)

      const existingActive = repos.sessions.findActiveByProject(project.id)
      let staleSessionClosed: { id: string; duration: number } | undefined

      if (existingActive) {
        const staleResult = closeStaleSession(existingActive)
        if (staleResult) {
          staleSessionClosed = staleResult
        } else {
          const isAttached = repos.sessions.isTerminalAttached(existingActive.id, terminalId)
          if (isAttached) {
            return {
              action: 'already_active',
              session: existingActive,
              project,
              source: resolved.source,
            }
          }

          repos.sessions.attachTerminal(existingActive.id, terminalId)
          repos.pulses.create({
            id: crypto.randomUUID(),
            sessionId: existingActive.id,
            terminalId,
            sourceType: 'manual',
            timestamp: Date.now(),
          })

          return {
            action: 'attached',
            session: existingActive,
            project,
            source: resolved.source,
          }
        }
      }

      // Also check for any other stale active sessions
      const allActive = repos.sessions.findActiveAll()
      for (const activeSession of allActive) {
        if (activeSession.id !== existingActive?.id) {
          closeStaleSession(activeSession)
        }
      }

      const now = Date.now()
      const session = repos.sessions.create({
        id: crypto.randomUUID(),
        projectId: project.id,
        startTime: now,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        source: 'manual',
        rateAtTime: project.hourlyRate ?? null,
        idleDeductedMs: 0,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      })

      repos.undo.push('start', {
        sessions: [],
        notes: [],
        tags: [],
        deletedSessionIds: [session.id],
      })

      repos.sessions.attachTerminal(session.id, terminalId)
      repos.pulses.create({
        id: crypto.randomUUID(),
        sessionId: session.id,
        terminalId,
        sourceType: 'manual',
        timestamp: now,
      })

      return {
        action: 'created',
        session,
        project,
        source: resolved.source,
        staleSessionClosed,
      }
    },

    stop(cwd: string, terminalId: string, options?: SessionStopOptions): SessionStopResult {
      let project: Project | undefined
      let activeSession: Session | undefined

      if (options?.projectOverride) {
        const existing = repos.projects.findBySlug(options.projectOverride)
        if (existing) {
          project = existing
          activeSession = repos.sessions.findActiveByProject(existing.id)
        }
      } else {
        try {
          const resolved = resolveProject(cwd)
          const dbProject = ensureProjectInDb(resolved, repos.projects)
          project = dbProject
          activeSession = repos.sessions.findActiveByProject(dbProject.id)
        } catch {
          // Could not resolve project from cwd, fall through
        }
      }

      if (!activeSession) {
        const allActive = repos.sessions.findActiveAll()
        if (allActive.length === 1) {
          activeSession = allActive[0]!
          project = repos.projects.findBySlug('')  // need to look up by id
          // Look up the project by iterating
          const foundProject = repos.projects.findAll().find(p => p.id === activeSession!.projectId)
          if (foundProject) {
            project = foundProject
          }
        } else if (allActive.length === 0) {
          throw new NoActiveSessionError("Try 'tt start' to begin tracking")
        } else {
          throw new NoActiveSessionError(
            "Multiple active sessions found. Specify a project with: tt stop -p <project>",
          )
        }
      }

      if (!project) {
        const foundProject = repos.projects.findAll().find(p => p.id === activeSession!.projectId)
        project = foundProject
      }

      if (!project) {
        throw new NoActiveSessionError("Try 'tt start' to begin tracking")
      }

      const stopSnapshot = buildSnapshot([activeSession.id])
      repos.undo.push('stop', stopSnapshot)

      const endTime = Date.now()
      const stoppedSession = repos.sessions.stop(activeSession.id, endTime)
      const durationMs = computeSessionDuration(stoppedSession)

      return {
        session: stoppedSession,
        project,
        durationMs,
      }
    },

    now(cwd: string): SessionNowResult {
      let project: Project | undefined
      let activeSession: Session | undefined

      try {
        const resolved = resolveProject(cwd)
        const dbProject = ensureProjectInDb(resolved, repos.projects)
        project = dbProject
        activeSession = repos.sessions.findActiveByProject(dbProject.id)
      } catch {
        // Not in a project directory, check for any active session
        const allActive = repos.sessions.findActiveAll()
        if (allActive.length > 0) {
          activeSession = allActive[0]!
          project = repos.projects.findAll().find(p => p.id === activeSession!.projectId)
        }
      }

      const durationMs = activeSession ? computeSessionDuration(activeSession) : 0
      const { totalMs: todayTotalMs, sessionCount: todaySessionCount } = getTodayStats(project?.id)

      let idleState: import('./idle-detector').IdleState | null = null
      let idleDurationMs = 0

      if (activeSession) {
        const latestPulse = repos.pulses.getLatestForSession(activeSession.id)
        if (latestPulse) {
          const now = Date.now()
          const idleConfig = loadIdleConfig()
          idleState = computeIdleState(
            latestPulse.timestamp,
            now,
            activeSession.pausedAt,
            idleConfig,
          )
          idleDurationMs = now - latestPulse.timestamp
        }
      }

      return {
        session: activeSession ?? null,
        project: project ?? null,
        durationMs,
        todayTotalMs,
        todaySessionCount,
        idleState,
        idleDurationMs,
      }
    },

    addNote(cwd: string, content: string): { session: Session; note: ReturnType<Repositories['notes']['create']> } {
      if (content.length > NOTE_MAX_LENGTH) {
        throw new Error('Note exceeds 10,000 character limit')
      }

      let activeSession: Session | undefined

      try {
        const resolved = resolveProject(cwd)
        const dbProject = ensureProjectInDb(resolved, repos.projects)
        activeSession = repos.sessions.findActiveByProject(dbProject.id)
      } catch {
        const allActive = repos.sessions.findActiveAll()
        if (allActive.length === 1) {
          activeSession = allActive[0]
        }
      }

      if (!activeSession) {
        throw new NoActiveSessionError("Start a session first with: tt start")
      }

      const note = repos.notes.create(activeSession.id, content)
      return { session: activeSession, note }
    },

    addTag(cwd: string, tag: string): { session: Session; tag: ReturnType<Repositories['tags']['addTag']> } {
      if (!KEBAB_CASE_PATTERN.test(tag)) {
        throw new InvalidTagError(tag)
      }

      let activeSession: Session | undefined

      try {
        const resolved = resolveProject(cwd)
        const dbProject = ensureProjectInDb(resolved, repos.projects)
        activeSession = repos.sessions.findActiveByProject(dbProject.id)
      } catch {
        const allActive = repos.sessions.findActiveAll()
        if (allActive.length === 1) {
          activeSession = allActive[0]
        }
      }

      if (!activeSession) {
        throw new NoActiveSessionError("Start a session first with: tt start")
      }

      const addedTag = repos.tags.addTag(activeSession.id, tag)
      return { session: activeSession, tag: addedTag }
    },

    removeTag(cwd: string, tag: string): void {
      let activeSession: Session | undefined

      try {
        const resolved = resolveProject(cwd)
        const dbProject = ensureProjectInDb(resolved, repos.projects)
        activeSession = repos.sessions.findActiveByProject(dbProject.id)
      } catch {
        const allActive = repos.sessions.findActiveAll()
        if (allActive.length === 1) {
          activeSession = allActive[0]
        }
      }

      if (!activeSession) {
        throw new NoActiveSessionError("Start a session first with: tt start")
      }

      repos.tags.removeTag(activeSession.id, tag)
    },

    pulse(options: PulseOptions): PulseResult {
      const { cwd, source, terminalId } = options

      // Resolve project from cwd (outside transaction — no DB writes)
      let resolved: ResolvedProject
      let project: Project
      try {
        resolved = resolveProject(cwd)
        project = ensureProjectInDb(resolved, repos.projects)
      } catch {
        // Cannot resolve project — nothing to pulse
        return { action: 'rate-limited' }
      }

      // Wrap rate-limit check + session logic in a transaction to prevent races
      return withTransaction(() => {
        // Rate limit check: if last pulse for this terminal was within threshold, skip
        const latestPulse = repos.pulses.getLatestForTerminal(terminalId)
        if (latestPulse && (Date.now() - latestPulse.timestamp) < PULSE_RATE_LIMIT_MS) {
          return { action: 'rate-limited' as const }
        }

        // Close stale sessions first
        const allActive = repos.sessions.findActiveAll()
        for (const activeSession of allActive) {
          closeStaleSession(activeSession)
        }

        // Find active session for this project
        const existingSession = repos.sessions.findActiveByProject(project.id)

        if (!existingSession) {
          // Auto-create a new session
          const now = Date.now()
          const session = repos.sessions.create({
            id: crypto.randomUUID(),
            projectId: project.id,
            startTime: now,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            source,
            rateAtTime: project.hourlyRate ?? null,
            idleDeductedMs: 0,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          })

          repos.sessions.attachTerminal(session.id, terminalId)
          repos.pulses.create({
            id: crypto.randomUUID(),
            sessionId: session.id,
            terminalId,
            sourceType: source,
            timestamp: now,
          })

          return { action: 'created' as const, session, project }
        }

        // Idle reconciliation before writing pulse
        const now = Date.now()
        const lastSessionPulse = repos.pulses.getLatestForSession(existingSession.id)
        let reconciledSession = existingSession

        if (lastSessionPulse) {
          const idleConfig = loadIdleConfig()
          const idleState = computeIdleState(
            lastSessionPulse.timestamp,
            now,
            existingSession.pausedAt,
            idleConfig,
          )

          if (idleState === 'hard-idle') {
            const deduction = computeIdleDeduction(lastSessionPulse.timestamp, now, idleConfig)
            if (deduction > 0) {
              reconciledSession = repos.sessions.resumeFromIdle(existingSession.id, deduction)
            }
          } else if (idleState === 'paused' && existingSession.pausedAt !== null) {
            const breakDeduction = Math.max(0, now - existingSession.pausedAt)
            if (breakDeduction > 0) {
              reconciledSession = repos.sessions.resumeFromIdle(existingSession.id, breakDeduction)
            }
          }
        }

        // Session exists — attach terminal if not already attached
        const isAttached = repos.sessions.isTerminalAttached(reconciledSession.id, terminalId)
        if (!isAttached) {
          repos.sessions.attachTerminal(reconciledSession.id, terminalId)

          repos.pulses.create({
            id: crypto.randomUUID(),
            sessionId: reconciledSession.id,
            terminalId,
            sourceType: source,
            timestamp: now,
          })

          return { action: 'attached' as const, session: reconciledSession, project }
        }

        // Already attached — just record the pulse
        repos.pulses.create({
          id: crypto.randomUUID(),
          sessionId: reconciledSession.id,
          terminalId,
          sourceType: source,
          timestamp: now,
        })

        return { action: 'pulsed' as const, session: reconciledSession, project }
      })
    },

    away(cwd: string): AwayResult {
      let project: Project | undefined
      let activeSession: Session | undefined

      try {
        const resolved = resolveProject(cwd)
        const dbProject = ensureProjectInDb(resolved, repos.projects)
        project = dbProject
        activeSession = repos.sessions.findActiveByProject(dbProject.id)
      } catch {
        const allActive = repos.sessions.findActiveAll()
        if (allActive.length > 0) {
          activeSession = allActive[0]!
          project = repos.projects.findAll().find(p => p.id === activeSession!.projectId)
        }
      }

      if (!activeSession || !project) {
        throw new NoActiveSessionError("No active session to pause")
      }

      const now = Date.now()

      if (activeSession.pausedAt !== null) {
        return {
          action: 'already_paused',
          session: activeSession,
          project,
          pauseDurationMs: now - activeSession.pausedAt,
        }
      }

      const updatedSession = repos.sessions.setPausedAt(activeSession.id, now)
      return { action: 'paused', session: updatedSession, project }
    },

    edit(sessionPrefix: string, options: EditOptions): EditResult {
      const session = resolveSessionByPrefix(sessionPrefix)
      const changes: string[] = []

      return withTransaction(() => {
        // Snapshot before editing
        const snapshot = buildSnapshot([session.id])
        repos.undo.push('edit', snapshot)

        let newStartTime = session.startTime
        let newEndTime = session.endTime

        // Parse --start
        if (options.start) {
          newStartTime = parseEditTime(options.start, session.startTime)
          changes.push(`start: ${new Date(session.startTime).toISOString()} -> ${new Date(newStartTime).toISOString()}`)
        }

        // Parse --end
        if (options.end) {
          if (!session.endTime) {
            throw new InvalidTimeRangeError('Cannot edit end time of an active session. Stop it first.')
          }
          newEndTime = parseEditTime(options.end, session.startTime)
          changes.push(`end: ${new Date(session.endTime).toISOString()} -> ${new Date(newEndTime!).toISOString()}`)
        }

        // Validate time range
        if (newEndTime !== null && newEndTime !== undefined && newStartTime >= newEndTime) {
          throw new InvalidTimeRangeError(`start (${new Date(newStartTime).toISOString()}) must be before end (${new Date(newEndTime).toISOString()})`)
        }

        // Apply time changes
        const timeChanges: Record<string, unknown> = {}
        if (options.start) timeChanges['startTime'] = newStartTime
        if (options.end) timeChanges['endTime'] = newEndTime

        // Parse --project
        if (options.project) {
          const newProject = repos.projects.findBySlug(options.project)
          if (!newProject) {
            throw new Error(`Project "${options.project}" not found`)
          }
          timeChanges['projectId'] = newProject.id
          changes.push(`project: -> ${options.project}`)
        }

        if (Object.keys(timeChanges).length > 0) {
          repos.sessions.update(session.id, timeChanges as Partial<Pick<Session, 'startTime' | 'endTime' | 'projectId'>>)
        }

        // Add note
        if (options.note) {
          if (options.note.length > NOTE_MAX_LENGTH) {
            throw new Error('Note exceeds 10,000 character limit')
          }
          repos.notes.create(session.id, options.note)
          changes.push(`note: added "${options.note}"`)
        }

        // Add tag
        if (options.tag) {
          repos.tags.addTag(session.id, options.tag)
          changes.push(`tag: added "${options.tag}"`)
        }

        // Remove tag
        if (options.untag) {
          repos.tags.removeTag(session.id, options.untag)
          changes.push(`tag: removed "${options.untag}"`)
        }

        const updated = repos.sessions.findById(session.id)!
        return { session: updated, changes }
      })
    },

    undo(): UndoResult {
      return withTransaction(() => {
        const entry = repos.undo.pop()
        if (!entry) throw new NothingToUndoError()

        const restoredSessionIds: string[] = []

        // Restore sessions
        for (const session of entry.snapshot.sessions) {
          repos.sessions.restore(session)
          restoredSessionIds.push(session.id)
        }

        // Restore notes: delete current notes for these sessions, re-insert snapshot
        for (const session of entry.snapshot.sessions) {
          repos.notes.deleteBySessionId(session.id)
        }
        for (const note of entry.snapshot.notes) {
          repos.notes.restoreNote(note)
        }

        // Restore tags: delete current tags for these sessions, re-insert snapshot
        for (const session of entry.snapshot.sessions) {
          repos.tags.deleteBySessionId(session.id)
        }
        for (const tag of entry.snapshot.tags) {
          repos.tags.restoreTag(tag)
        }

        // Hard-delete sessions created by the undone operation
        for (const id of entry.snapshot.deletedSessionIds ?? []) {
          repos.sessions.hardDelete(id)
        }

        return { operation: entry.operation, restoredSessionIds }
      })
    },

    back(cwd: string, terminalId: string): BackResult {
      let project: Project | undefined
      let activeSession: Session | undefined

      try {
        const resolved = resolveProject(cwd)
        const dbProject = ensureProjectInDb(resolved, repos.projects)
        project = dbProject
        activeSession = repos.sessions.findActiveByProject(dbProject.id)
      } catch {
        const allActive = repos.sessions.findActiveAll()
        if (allActive.length > 0) {
          activeSession = allActive[0]!
          project = repos.projects.findAll().find(p => p.id === activeSession!.projectId)
        }
      }

      if (!activeSession || !project || activeSession.pausedAt === null) {
        throw new NoActiveSessionError("Not on a break. Try 'tt away' first")
      }

      const now = Date.now()
      const breakDurationMs = Math.max(0, now - activeSession.pausedAt)

      const updatedSession = repos.sessions.resumeFromIdle(activeSession.id, breakDurationMs)

      // Write a resume pulse
      repos.pulses.create({
        id: crypto.randomUUID(),
        sessionId: updatedSession.id,
        terminalId,
        sourceType: 'manual',
        timestamp: now,
      })

      return { session: updatedSession, project, breakDurationMs }
    },

    previewSplit(sessionPrefix: string, splitTimeInput: string): SplitPreview {
      return previewSplitInternal(sessionPrefix, splitTimeInput)
    },

    split(sessionPrefix: string, splitTimeInput: string): SplitResult {
      const preview = previewSplitInternal(sessionPrefix, splitTimeInput)
      const session = preview.original

      return withTransaction(() => {
        const snapshot = buildSnapshot([session.id])

        const idA = crypto.randomUUID()
        const idB = crypto.randomUUID()

        const snapshotWithDeleted: UndoSnapshot = {
          ...snapshot,
          deletedSessionIds: [idA, idB],
        }
        repos.undo.push('split', snapshotWithDeleted)

        repos.sessions.softDelete(session.id)

        const now = Date.now()
        const sessionA = repos.sessions.create({
          id: idA,
          projectId: session.projectId,
          startTime: preview.sessionA.startTime,
          endTime: preview.sessionA.endTime,
          timezone: session.timezone,
          source: session.source,
          rateAtTime: session.rateAtTime,
          idleDeductedMs: preview.sessionA.idleDeductedMs,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })

        const sessionB = repos.sessions.create({
          id: idB,
          projectId: session.projectId,
          startTime: preview.sessionB.startTime,
          endTime: preview.sessionB.endTime,
          timezone: session.timezone,
          source: session.source,
          rateAtTime: session.rateAtTime,
          idleDeductedMs: preview.sessionB.idleDeductedMs,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })

        const notes = repos.notes.findBySessionId(session.id)
        const tags = repos.tags.findBySessionId(session.id)

        for (const note of notes) {
          repos.notes.create(sessionA.id, note.content)
          repos.notes.create(sessionB.id, note.content)
        }

        for (const tag of tags) {
          repos.tags.addTag(sessionA.id, tag.tag)
          repos.tags.addTag(sessionB.id, tag.tag)
        }

        const splitMs = preview.sessionA.endTime
        repos.pulses.reassignPulses(session.id, idA, splitMs)
        repos.pulses.reassignPulses(session.id, idB)

        return { sessionA, sessionB, originalId: session.id }
      })
    },

    previewMerge(prefixA: string, prefixB: string): MergePreview {
      return previewMergeInternal(prefixA, prefixB)
    },

    merge(prefixA: string, prefixB: string, force: boolean = false): MergeResult {
      const preview = previewMergeInternal(prefixA, prefixB)

      if (preview.requiresForce && !force) {
        throw new MergeValidationError(
          `Gap between sessions is ${Math.round(preview.gapMs / 60000)} minutes (> 60 min threshold). Use --force to proceed.`
        )
      }

      const { earlier, later } = preview

      return withTransaction(() => {
        const snapshotEarlier = buildSnapshot([earlier.id])
        const snapshotLater = buildSnapshot([later.id])

        const mergedId = crypto.randomUUID()

        const combinedSnapshot: UndoSnapshot = {
          sessions: [...snapshotEarlier.sessions, ...snapshotLater.sessions],
          notes: [...snapshotEarlier.notes, ...snapshotLater.notes],
          tags: [...snapshotEarlier.tags, ...snapshotLater.tags],
          deletedSessionIds: [mergedId],
        }
        repos.undo.push('merge', combinedSnapshot)

        repos.sessions.softDelete(earlier.id)
        repos.sessions.softDelete(later.id)

        const now = Date.now()
        const merged = repos.sessions.create({
          id: mergedId,
          projectId: earlier.projectId,
          startTime: preview.merged.startTime,
          endTime: preview.merged.endTime,
          timezone: earlier.timezone,
          source: 'merged',
          rateAtTime: earlier.rateAtTime,
          idleDeductedMs: preview.merged.idleDeductedMs,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })

        const earlierNotes = repos.notes.findBySessionId(earlier.id)
        const laterNotes = repos.notes.findBySessionId(later.id)
        for (const note of [...earlierNotes, ...laterNotes]) {
          repos.notes.create(merged.id, note.content)
        }

        const earlierTags = repos.tags.findBySessionId(earlier.id)
        const laterTags = repos.tags.findBySessionId(later.id)
        const allTagNames = new Set([...earlierTags.map(t => t.tag), ...laterTags.map(t => t.tag)])
        for (const tagName of allTagNames) {
          repos.tags.addTag(merged.id, tagName)
        }

        repos.pulses.reassignPulses(earlier.id, mergedId)
        repos.pulses.reassignPulses(later.id, mergedId)

        return { merged, removedIds: [earlier.id, later.id] }
      })
    },
  }
}

export type SessionService = ReturnType<typeof createSessionService>
