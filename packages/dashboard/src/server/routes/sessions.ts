import type { ReportService } from '../../../../../src/core/reports/report-service'

export function handleSessions(reportService: ReportService, params: URLSearchParams) {
  const from = params.get('from') ?? undefined
  const to = params.get('to') ?? undefined
  const project = params.get('project') ?? undefined

  const dayGroups = reportService.log({ projectSlug: project, from, to })

  return dayGroups.flatMap(group =>
    group.sessions.map(s => ({
      id: s.session.id,
      project: s.project.displayName,
      startTime: s.session.startTime,
      endTime: s.session.endTime,
      durationMs: s.durationMs,
    }))
  )
}
