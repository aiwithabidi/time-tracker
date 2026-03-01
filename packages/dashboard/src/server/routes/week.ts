import type { ReportService } from '../../../../../src/core/reports/report-service'

export function handleWeek(reportService: ReportService, params: URLSearchParams) {
  const project = params.get('project') ?? undefined
  const result = reportService.week(project)

  return {
    weekStart: result.weekStart,
    weekEnd: result.weekEnd,
    projects: result.projects.map(p => ({
      slug: p.project.slug,
      displayName: p.project.displayName,
      totalMs: p.totalMs,
      sessionCount: p.sessionCount,
    })),
    grandTotalMs: result.grandTotalMs,
  }
}
