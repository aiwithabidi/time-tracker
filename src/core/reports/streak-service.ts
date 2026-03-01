import type { Repositories } from '../../db/repositories/index'
import { computeSessionDuration } from '../shared/duration'
import { DateTime } from 'luxon'

export interface DayData {
  readonly date: string
  readonly minutes: number
  readonly metGoal: boolean
}

export interface StreakResult {
  readonly current: number
  readonly best: number
  readonly avgDailyMinutes: number
  readonly last28Days: readonly DayData[]
}

interface StreakServiceDeps {
  readonly repos: Repositories
}

export function createStreakService(deps: StreakServiceDeps) {
  const { repos } = deps

  function buildDayMap(sessions: ReturnType<Repositories['sessions']['findByDateRange']>): Map<string, number> {
    const dayMap = new Map<string, number>()
    for (const s of sessions) {
      const dateKey = DateTime.fromMillis(s.startTime).toISODate()
      if (!dateKey) continue
      const durationMs = computeSessionDuration(s)
      const minutes = durationMs / 60_000
      const existing = dayMap.get(dateKey) ?? 0
      dayMap.set(dateKey, existing + minutes)
    }
    return dayMap
  }

  function meetsThreshold(minutes: number, goalMinutes?: number): boolean {
    if (goalMinutes !== undefined) {
      return minutes >= goalMinutes
    }
    return minutes > 0
  }

  function computeCurrentStreak(dayMap: Map<string, number>, goalMinutes?: number): number {
    const today = DateTime.now().startOf('day')
    let streak = 0
    let day = today

    // If today has no qualifying time, start checking from yesterday
    const todayKey = today.toISODate() ?? ''
    const todayMinutes = dayMap.get(todayKey) ?? 0
    if (!meetsThreshold(todayMinutes, goalMinutes)) {
      day = today.minus({ days: 1 })
    }

    while (true) {
      const key = day.toISODate() ?? ''
      const minutes = dayMap.get(key) ?? 0
      if (!meetsThreshold(minutes, goalMinutes)) {
        break
      }
      streak += 1
      day = day.minus({ days: 1 })
    }

    return streak
  }

  function computeBestStreak(dayMap: Map<string, number>, startDate: DateTime, endDate: DateTime, goalMinutes?: number): number {
    let best = 0
    let current = 0
    let day = startDate

    while (day <= endDate) {
      const key = day.toISODate() ?? ''
      const minutes = dayMap.get(key) ?? 0
      if (meetsThreshold(minutes, goalMinutes)) {
        current += 1
        if (current > best) {
          best = current
        }
      } else {
        current = 0
      }
      day = day.plus({ days: 1 })
    }

    return best
  }

  function buildLast28Days(dayMap: Map<string, number>, goalMinutes?: number): readonly DayData[] {
    const today = DateTime.now().startOf('day')
    const days: DayData[] = []

    for (let i = 27; i >= 0; i--) {
      const day = today.minus({ days: i })
      const key = day.toISODate() ?? ''
      const minutes = Math.round(dayMap.get(key) ?? 0)
      days.push({
        date: key,
        minutes,
        metGoal: meetsThreshold(minutes, goalMinutes),
      })
    }

    return days
  }

  return {
    getStreak(goalMinutes?: number): StreakResult {
      const now = DateTime.now()
      const yearAgo = now.minus({ days: 365 }).startOf('day')
      const sessions = repos.sessions.findByDateRange(yearAgo.toMillis(), now.endOf('day').toMillis())
      const dayMap = buildDayMap(sessions)

      const current = computeCurrentStreak(dayMap, goalMinutes)
      const best = computeBestStreak(dayMap, yearAgo, now, goalMinutes)

      // Average: sum all minutes / count of days with any tracked time
      let totalMinutes = 0
      let daysWithTime = 0
      for (const minutes of dayMap.values()) {
        if (minutes > 0) {
          totalMinutes += minutes
          daysWithTime += 1
        }
      }
      const avgDailyMinutes = daysWithTime > 0 ? Math.round(totalMinutes / daysWithTime) : 0

      const last28Days = buildLast28Days(dayMap, goalMinutes)

      return { current, best, avgDailyMinutes, last28Days }
    },

    getHeatmapData(goalMinutes?: number, year?: number): readonly DayData[] {
      const targetYear = year ?? DateTime.now().year
      const startOfYear = DateTime.fromObject({ year: targetYear, month: 1, day: 1 })
      const endOfYear = DateTime.fromObject({ year: targetYear, month: 12, day: 31 })
      const totalDays = Math.floor(endOfYear.diff(startOfYear, 'days').days) + 1

      const sessions = repos.sessions.findByDateRange(
        startOfYear.toMillis(),
        endOfYear.endOf('day').toMillis(),
      )
      const dayMap = buildDayMap(sessions)

      const days: DayData[] = []
      for (let i = 0; i < totalDays; i++) {
        const day = startOfYear.plus({ days: i })
        const key = day.toISODate() ?? ''
        const minutes = Math.round(dayMap.get(key) ?? 0)
        days.push({
          date: key,
          minutes,
          metGoal: meetsThreshold(minutes, goalMinutes),
        })
      }

      return days
    },
  }
}

export type StreakService = ReturnType<typeof createStreakService>
