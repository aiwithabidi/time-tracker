import type { StreakService } from '../../../../../src/core/reports/streak-service'
import type { Config } from '../../../../../src/config/types'

export function handleStreak(streakService: StreakService, config: Config) {
  const goalMinutes = config.goal.dailyMinutes
  const result = streakService.getStreak(goalMinutes)

  return {
    current: result.current,
    best: result.best,
    avgDailyMinutes: result.avgDailyMinutes,
    ...(goalMinutes ? { goalMinutes } : {}),
  }
}
