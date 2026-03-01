import type { Repositories } from '../../db/repositories/index'
import type { Session, Project } from '../../db/types'
import type { ProjectSummary, DayGroup, SessionRow, WeekSummary, TodaySummary, LastSessionResult } from './types'
import { computeSessionDuration } from '../shared/duration'
import { DateTime } from 'luxon'

interface ReportServiceDeps {
  readonly repos: Repositories
}

export function createReportService(deps: ReportServiceDeps) {
  const { repos } = deps

  function buildProjectMap(): Map<string, Project> {
    const projects = repos.projects.findAll()
    const map = new Map<string, Project>()
    for (const p of projects) {
      map.set(p.id, p)
    }
    return map
  }

  function aggregateByProject(sessions: Session[], projectMap: Map<string, Project>): ProjectSummary[] {
    const totals = new Map<string, { totalMs: number; sessionCount: number }>()

    for (const s of sessions) {
      const existing = totals.get(s.projectId) ?? { totalMs: 0, sessionCount: 0 }
      totals.set(s.projectId, {
        totalMs: existing.totalMs + computeSessionDuration(s),
        sessionCount: existing.sessionCount + 1,
      })
    }

    const result: ProjectSummary[] = []
    for (const [projectId, stats] of totals) {
      const project = projectMap.get(projectId)
      if (project) {
        result.push({ project, ...stats })
      }
    }

    return result.sort((a, b) => b.totalMs - a.totalMs)
  }

  function groupByDay(sessions: Session[], projectMap: Map<string, Project>): DayGroup[] {
    const groups = new Map<string, { sessions: SessionRow[]; totalMs: number }>()

    const sorted = [...sessions].sort((a, b) => b.startTime - a.startTime)

    for (const s of sorted) {
      const dt = DateTime.fromMillis(s.startTime)
      const dateKey = dt.toISODate()!
      const project = projectMap.get(s.projectId)
      if (!project) continue

      const durationMs = computeSessionDuration(s)
      const existing = groups.get(dateKey) ?? { sessions: [], totalMs: 0 }
      existing.sessions.push({ session: s, project, durationMs })
      existing.totalMs += durationMs
      groups.set(dateKey, existing)
    }

    const result: DayGroup[] = []
    for (const [dateKey, group] of groups) {
      const dt = DateTime.fromISO(dateKey)
      result.push({
        date: dateKey,
        displayDate: dt.toFormat('ccc dd LLL yyyy'),
        sessions: group.sessions,
        totalMs: group.totalMs,
      })
    }

    return result.sort((a, b) => b.date.localeCompare(a.date))
  }

  return {
    today(): TodaySummary {
      const now = DateTime.now()
      const startOfDay = now.startOf('day').toMillis()
      const endOfDay = now.endOf('day').toMillis()

      const sessions = repos.sessions.findByDateRange(startOfDay, endOfDay)
      const projectMap = buildProjectMap()
      const projects = aggregateByProject(sessions, projectMap)
      const grandTotalMs = projects.reduce((sum, p) => sum + p.totalMs, 0)

      const activeSessions = repos.sessions.findActiveAll()
      let activeSession: TodaySummary['activeSession']
      if (activeSessions.length > 0) {
        const active = activeSessions[0]!
        const project = projectMap.get(active.projectId)
        if (project) {
          activeSession = {
            session: active,
            project,
            durationMs: computeSessionDuration(active),
          }
        }
      }

      return { projects, grandTotalMs, activeSession }
    },

    week(projectSlug?: string): WeekSummary {
      const now = DateTime.now()
      const weekStart = now.startOf('week')
      const weekEnd = now.endOf('week')

      let projectId: string | undefined
      if (projectSlug) {
        const project = repos.projects.findBySlug(projectSlug)
        if (!project) {
          throw new Error(`Project "${projectSlug}" not found`)
        }
        projectId = project.id
      }

      const sessions = repos.sessions.findByDateRange(
        weekStart.toMillis(),
        weekEnd.toMillis(),
        projectId,
      )
      const projectMap = buildProjectMap()
      const projects = aggregateByProject(sessions, projectMap)
      const grandTotalMs = projects.reduce((sum, p) => sum + p.totalMs, 0)

      return {
        weekStart: weekStart.toISODate()!,
        weekEnd: weekEnd.toISODate()!,
        projects,
        grandTotalMs,
      }
    },

    log(options?: { projectSlug?: string; from?: string; to?: string }): DayGroup[] {
      const projectMap = buildProjectMap()

      let projectId: string | undefined
      if (options?.projectSlug) {
        const project = repos.projects.findBySlug(options.projectSlug)
        if (!project) {
          throw new Error(`Project "${options.projectSlug}" not found`)
        }
        projectId = project.id
      }

      const fromDt = options?.from
        ? DateTime.fromISO(options.from).startOf('day')
        : DateTime.now().minus({ days: 7 }).startOf('day')
      const toDt = options?.to
        ? DateTime.fromISO(options.to).endOf('day')
        : DateTime.now().endOf('day')

      if (!fromDt.isValid) {
        throw new Error(`Invalid --from date: "${options?.from}". Use YYYY-MM-DD format.`)
      }
      if (!toDt.isValid) {
        throw new Error(`Invalid --to date: "${options?.to}". Use YYYY-MM-DD format.`)
      }

      const sessions = repos.sessions.findByDateRange(
        fromDt.toMillis(),
        toDt.toMillis(),
        projectId,
      )

      return groupByDay(sessions, projectMap)
    },

    last(): LastSessionResult | null {
      const session = repos.sessions.findLastCompleted()
      if (!session) return null

      const projectMap = buildProjectMap()
      const project = projectMap.get(session.projectId)
      if (!project) return null

      return {
        session,
        project,
        durationMs: computeSessionDuration(session),
      }
    },

    allProjects(): ProjectSummary[] {
      const now = DateTime.now()
      const weekStart = now.startOf('week')
      const weekEnd = now.endOf('week')

      const sessions = repos.sessions.findByDateRange(
        weekStart.toMillis(),
        weekEnd.toMillis(),
      )
      const projectMap = buildProjectMap()

      const allProjects = repos.projects.findAll()
      const summaryMap = new Map<string, ProjectSummary>()

      for (const project of allProjects) {
        summaryMap.set(project.id, { project, totalMs: 0, sessionCount: 0 })
      }

      for (const s of sessions) {
        const existing = summaryMap.get(s.projectId)
        if (existing) {
          summaryMap.set(s.projectId, {
            ...existing,
            totalMs: existing.totalMs + computeSessionDuration(s),
            sessionCount: existing.sessionCount + 1,
          })
        }
      }

      return Array.from(summaryMap.values()).sort((a, b) => b.totalMs - a.totalMs)
    },
  }
}

export type ReportService = ReturnType<typeof createReportService>
