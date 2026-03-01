import type { ReportService } from '../../../../../src/core/reports/report-service'

export function handleToday(reportService: ReportService) {
  const result = reportService.today()

  return {
    projects: result.projects.map(p => ({
      slug: p.project.slug,
      displayName: p.project.displayName,
      totalMs: p.totalMs,
      sessionCount: p.sessionCount,
    })),
    grandTotalMs: result.grandTotalMs,
    activeSession: result.activeSession
      ? {
          project: result.activeSession.project.displayName,
          durationMs: result.activeSession.durationMs,
        }
      : null,
  }
}
