import type { Repositories } from '../../db/repositories/index'
import type { Session, Project } from '../../db/types'
import { resolveProject, ensureProjectInDb } from '../../services/project-resolver'
import { NoActiveSessionError } from './errors'
import type {
  SessionStartResult,
  SessionStopResult,
  SessionNowResult,
  SessionStartOptions,
  SessionStopOptions,
  AwayResult,
  BackResult,
} from './types'
import { computeSessionDuration } from '../shared/duration'
import { computeIdleState } from './idle-detector'
import { DateTime } from 'luxon'
import {
  resolveAndEnsureProject,
  resolveActiveSessionAny,
  buildSnapshot,
  loadIdleConfig,
} from './session-helpers'
import type { PulseService } from './pulse-service'

interface LifecycleServiceDeps {
  readonly repos: Repositories
  readonly pulseService: PulseService
}

function getStartOfToday(): number {
  return DateTime.now().startOf('day').toMillis()
}

export function createLifecycleService(deps: LifecycleServiceDeps) {
  const { repos, pulseService } = deps
  const { idleConfig } = loadIdleConfig()

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
      const { resolved, project } = resolveAndEnsureProject(repos, cwd, options?.projectOverride)

      const existingActive = repos.sessions.findActiveByProject(project.id)
      let staleSessionClosed: { id: string; duration: number } | undefined

      if (existingActive) {
        const staleResult = pulseService.closeStaleSession(existingActive)
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
          pulseService.closeStaleSession(activeSession)
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
          project = repos.projects.findById(activeSession.projectId)
        } else if (allActive.length === 0) {
          throw new NoActiveSessionError("Try 'tt start' to begin tracking")
        } else {
          throw new NoActiveSessionError(
            "Multiple active sessions found. Specify a project with: tt stop -p <project>",
          )
        }
      }

      if (!project) {
        project = repos.projects.findById(activeSession!.projectId)
      }

      if (!project) {
        throw new NoActiveSessionError("Try 'tt start' to begin tracking")
      }

      const stopSnapshot = buildSnapshot(repos, [activeSession.id])
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
      const resolved = resolveActiveSessionAny(repos, cwd)
      const activeSession = resolved?.session
      const project = resolved?.project

      const durationMs = activeSession ? computeSessionDuration(activeSession) : 0
      const { totalMs: todayTotalMs, sessionCount: todaySessionCount } = getTodayStats(project?.id)

      let idleState: import('./idle-detector').IdleState | null = null
      let idleDurationMs = 0

      if (activeSession) {
        const latestPulse = repos.pulses.getLatestForSession(activeSession.id)
        if (latestPulse) {
          const now = Date.now()
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

    away(cwd: string): AwayResult {
      const resolved = resolveActiveSessionAny(repos, cwd)

      if (!resolved) {
        throw new NoActiveSessionError("No active session to pause")
      }

      const { session: activeSession, project } = resolved
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
      const resolved = resolveActiveSessionAny(repos, cwd)

      if (!resolved || resolved.session.pausedAt === null) {
        throw new NoActiveSessionError("Not on a break. Try 'tt away' first")
      }

      const { session: activeSession, project } = resolved
      const now = Date.now()
      const breakDurationMs = Math.max(0, now - activeSession.pausedAt!)

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

export type LifecycleService = ReturnType<typeof createLifecycleService>
