import { define } from 'gunshi'
import chalk from 'chalk'
import { output, formatDuration } from '../format'
import { createStreakService, handleCommandError } from '../helpers'
import { loadConfig } from '../../config/config-loader'
import { formatGoalDuration } from '../duration-parsing'

const INTENSITY_CHARS = [' ', '\u2591', '\u2592', '\u2593', '\u2588'] as const
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function getIntensityLevel(minutes: number, maxMinutes: number): number {
  if (minutes === 0) return 0
  if (maxMinutes === 0) return 0
  const ratio = minutes / maxMinutes
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

function colorIntensity(char: string, level: number): string {
  if (level === 0) return chalk.gray(char)
  if (level <= 2) return chalk.green(char)
  if (level <= 4) return chalk.greenBright(char)
  return char
}

function renderHeatmap(days: readonly { readonly date: string; readonly minutes: number }[]): string {
  const maxMinutes = Math.max(...days.map(d => d.minutes), 1)

  // Organize into 4 weeks (columns) x 7 days (rows)
  // days array is chronological (oldest first), 28 entries
  const lines: string[] = []

  for (let row = 0; row < 7; row++) {
    const label = (DAY_LABELS[row] ?? '').padEnd(4)
    const cells: string[] = []
    for (let col = 0; col < 4; col++) {
      const idx = col * 7 + row
      const day = days[idx]
      if (day) {
        const level = getIntensityLevel(day.minutes, maxMinutes)
        const intensityChar = INTENSITY_CHARS[level] ?? ' '
        cells.push(colorIntensity(intensityChar + intensityChar, level))
      }
    }
    lines.push(`  ${label}${cells.join(' ')}`)
  }

  return lines.join('\n')
}

const streakCommand = define({
  name: 'streak',
  description: 'Show your tracking streak and 28-day heatmap',
  args: {},
  run: () => {
    try {
      const config = loadConfig()
      const service = createStreakService()
      const goalMinutes = config.goal.dailyMinutes
      const result = service.getStreak(goalMinutes)

      // Streak stats
      const currentLabel = result.current === 1 ? 'day' : 'days'
      const bestLabel = result.best === 1 ? 'day' : 'days'

      if (result.current > 0) {
        output('started', `Current streak: ${result.current} ${currentLabel}`)
      } else {
        output('idle', 'Current streak: 0 days')
      }

      output('info', `Best streak: ${result.best} ${bestLabel}`)
      output('info', `Avg daily: ${formatDuration(result.avgDailyMinutes * 60_000)}`)

      if (goalMinutes) {
        output('info', `Goal: ${formatGoalDuration(goalMinutes)}/day`)
      }

      // 28-day heatmap
      process.stdout.write('\n  Last 28 days:\n')
      process.stdout.write(renderHeatmap(result.last28Days) + '\n')

      // Legend
      const legend = `  ${chalk.gray('[ ]')} none  ${chalk.green('\u2591\u2591')} light  ${chalk.green('\u2592\u2592')} moderate  ${chalk.greenBright('\u2593\u2593')} solid  ${chalk.greenBright('\u2588\u2588')} peak`
      process.stdout.write(legend + '\n')
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default streakCommand
