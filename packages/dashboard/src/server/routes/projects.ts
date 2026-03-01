import type { ReportService } from '../../../../../src/core/reports/report-service'

export function handleProjects(reportService: ReportService) {
  const projects = reportService.allProjects()

  return projects.map(p => ({
    slug: p.project.slug,
    displayName: p.project.displayName,
    weekTotalMs: p.totalMs,
    sessionCount: p.sessionCount,
  }))
}
