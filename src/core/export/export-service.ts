import { DateTime } from 'luxon'
import type { Session } from '../../db/types'
import type { Repositories } from '../../db/repositories/index'
import { CSV_HEADERS, toCSVRow } from './csv'
import { formatDuration } from '../../cli/format'

export interface SessionWithDetails {
  readonly session: Session
  readonly projectSlug: string
  readonly projectName: string
  readonly notes: readonly string[]
  readonly tags: readonly string[]
}

export function createExportService(repos: Repositories) {
  return {
    getSessionsForExport(options: {
      from?: number
      to?: number
      projectSlug?: string
    }): SessionWithDetails[] {
      let projectId: string | undefined

      if (options.projectSlug) {
        const project = repos.projects.findBySlug(options.projectSlug)
        if (!project) {
          throw new Error(`Project not found: ${options.projectSlug}`)
        }
        projectId = project.id
      }

      const from = options.from ?? 0
      const to = options.to ?? Date.now()
      const sessions = repos.sessions.findByDateRange(from, to, projectId)

      const allProjects = repos.projects.findAll()
      const projectMap = new Map(allProjects.map(p => [p.id, p]))

      const result: SessionWithDetails[] = sessions.map(session => {
        const project = projectMap.get(session.projectId)
        const notes = repos.notes.findBySession(session.id)
        const tags = repos.tags.findBySession(session.id)

        return {
          session,
          projectSlug: project?.slug ?? 'unknown',
          projectName: project?.displayName ?? 'Unknown',
          notes: notes.map(n => n.content),
          tags: tags.map(t => t.tag),
        }
      })

      return result.sort((a, b) => a.session.startTime - b.session.startTime)
    },

    toCSV(sessions: readonly SessionWithDetails[], timezone: string): string {
      const headerRow = toCSVRow([...CSV_HEADERS])

      const dataRows = sessions.map(s => {
        const startDt = DateTime.fromMillis(s.session.startTime).setZone(timezone)
        const endDt = s.session.endTime
          ? DateTime.fromMillis(s.session.endTime).setZone(timezone)
          : null

        const durationMs =
          (s.session.endTime ?? Date.now()) - s.session.startTime - s.session.idleDeductedMs
        const durationHours = (durationMs / 3_600_000).toFixed(2)

        return toCSVRow([
          s.projectSlug,
          startDt.toISODate() ?? '',
          startDt.toFormat('HH:mm'),
          endDt ? endDt.toFormat('HH:mm') : 'active',
          durationHours,
          formatDuration(durationMs),
          s.notes.join('; '),
          s.tags.join(', '),
        ])
      })

      return [headerRow, ...dataRows].join('\n') + '\n'
    },

    getDryRunSummary(sessions: readonly SessionWithDetails[]): {
      count: number
      totalMs: number
    } {
      const totalMs = sessions.reduce((sum, s) => {
        const duration =
          (s.session.endTime ?? Date.now()) - s.session.startTime - s.session.idleDeductedMs
        return sum + duration
      }, 0)

      return { count: sessions.length, totalMs }
    },
  }
}
