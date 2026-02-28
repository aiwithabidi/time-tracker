import type { Repositories } from '../../db/repositories/index'
import type { Session, Project } from '../../db/types'
import { resolveProject, ensureProjectInDb, type ResolvedProject } from '../../services/project-resolver'
import { NoActiveSessionError, NoProjectFoundError, InvalidTagError } from './errors'
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
} from './types'
import { computeIdleState, computeIdleDeduction, type IdleConfig } from './idle-detector'
import { loadConfig } from '../../config/config-loader'

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000
const STALE_FALLBACK_DURATION_MS = 60 * 60 * 1000
const PULSE_RATE_LIMIT_MS = 60_000
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

      return {
        session: activeSession ?? null,
        project: project ?? null,
        durationMs,
        todayTotalMs,
        todaySessionCount,
      }
    },

    addNote(cwd: string, content: string): { session: Session; note: ReturnType<Repositories['notes']['create']> } {
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

      // Rate limit check: if last pulse for this terminal was within threshold, skip
      const latestPulse = repos.pulses.getLatestForTerminal(terminalId)
      if (latestPulse && (Date.now() - latestPulse.timestamp) < PULSE_RATE_LIMIT_MS) {
        return { action: 'rate-limited' }
      }

      // Resolve project from cwd
      let resolved: ResolvedProject
      let project: Project
      try {
        resolved = resolveProject(cwd)
        project = ensureProjectInDb(resolved, repos.projects)
      } catch {
        // Cannot resolve project — nothing to pulse
        return { action: 'rate-limited' }
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

        return { action: 'created', session, project }
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

        return { action: 'attached', session: reconciledSession, project }
      }

      // Already attached — just record the pulse
      repos.pulses.create({
        id: crypto.randomUUID(),
        sessionId: reconciledSession.id,
        terminalId,
        sourceType: source,
        timestamp: now,
      })

      return { action: 'pulsed', session: reconciledSession, project }
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
  }
}

export type SessionService = ReturnType<typeof createSessionService>
