import type { Repositories } from '../../../../../src/db/repositories/index'
import type { Config } from '../../../../../src/config/types'
import { computeSessionDuration } from '../../../../../src/core/shared/duration'

export function handleNow(repos: Repositories, config: Config) {
  const activeSessions = repos.sessions.findActiveAll()
  const goalMinutes = config.goal.dailyMinutes

  if (activeSessions.length === 0) {
    const result: Record<string, unknown> = {
      active: false,
      project: null,
      durationMs: 0,
      todayTotalMs: 0,
      idleState: null,
    }
    if (goalMinutes) {
      result['goalMinutes'] = goalMinutes
      result['goalPercent'] = 0
    }
    return result
  }

  const session = activeSessions[0]!
  const project = repos.projects.findById(session.projectId)
  const durationMs = computeSessionDuration(session)

  const result: Record<string, unknown> = {
    active: true,
    project: project?.slug ?? null,
    durationMs,
    todayTotalMs: durationMs,
    idleState: null,
  }

  if (goalMinutes) {
    result['goalMinutes'] = goalMinutes
    result['goalPercent'] = Math.min(100, Math.round((durationMs / 60_000 / goalMinutes) * 100))
  }

  return result
}
