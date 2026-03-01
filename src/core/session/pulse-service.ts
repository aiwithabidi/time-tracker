import type { Repositories } from '../../db/repositories/index'
import type { Session, Project } from '../../db/types'
import { resolveProject, ensureProjectInDb } from '../../services/project-resolver'
import { computeIdleState, computeIdleDeduction, type IdleConfig } from './idle-detector'
import { withTransaction } from '../../db/client'
import type { PulseOptions, PulseResult } from './types'
import {
  STALE_THRESHOLD_MS,
  STALE_FALLBACK_DURATION_MS,
  PULSE_RATE_LIMIT_MS,
  loadIdleConfig,
} from './session-helpers'

interface PulseServiceDeps {
  readonly repos: Repositories
}

export function createPulseService(deps: PulseServiceDeps) {
  const { repos } = deps
  const { idleConfig } = loadIdleConfig()

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

  return {
    closeStaleSession,

    pulse(options: PulseOptions): PulseResult {
      const { cwd, source, terminalId } = options

      // Resolve project from cwd (outside transaction -- no DB writes)
      let project: Project
      try {
        const resolved = resolveProject(cwd)
        project = ensureProjectInDb(resolved, repos.projects)
      } catch {
        // Cannot resolve project -- nothing to pulse
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
          return createNewPulseSession(project, source, terminalId)
        }

        return reconcileAndPulse(existingSession, project, source, terminalId, idleConfig)
      })
    },
  }

  function createNewPulseSession(
    project: Project,
    source: string,
    terminalId: string,
  ): PulseResult {
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

  function reconcileAndPulse(
    existingSession: Session,
    project: Project,
    source: string,
    terminalId: string,
    idle: IdleConfig,
  ): PulseResult {
    const now = Date.now()
    const lastSessionPulse = repos.pulses.getLatestForSession(existingSession.id)
    let reconciledSession = existingSession

    if (lastSessionPulse) {
      const idleState = computeIdleState(
        lastSessionPulse.timestamp,
        now,
        existingSession.pausedAt,
        idle,
      )

      if (idleState === 'hard-idle') {
        const deduction = computeIdleDeduction(lastSessionPulse.timestamp, now, idle)
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

    // Session exists -- attach terminal if not already attached
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

    // Already attached -- just record the pulse
    repos.pulses.create({
      id: crypto.randomUUID(),
      sessionId: reconciledSession.id,
      terminalId,
      sourceType: source,
      timestamp: now,
    })

    return { action: 'pulsed' as const, session: reconciledSession, project }
  }
}

export type PulseService = ReturnType<typeof createPulseService>
