import type { StreakService } from '../../../../../src/core/reports/streak-service'

export function handleHeatmap(streakService: StreakService, params: URLSearchParams) {
  const yearStr = params.get('year')
  const year = yearStr ? parseInt(yearStr, 10) : undefined

  return streakService.getHeatmapData(year)
}
