import { define } from 'gunshi'
import { formatDuration, output } from '../format'
import { createReportService, createStreakService, handleCommandError } from '../helpers'
import { loadConfig } from '../../config/config-loader'
import { formatGoalDuration } from '../duration-parsing'
import { compactTable } from '../table'

const todayCommand = define({
  name: 'today',
  description: "Show today's time by project",
  args: {},
  run: () => {
    try {
      const service = createReportService()
      const result = service.today()

      if (result.projects.length === 0 && !result.activeSession) {
        output('idle', 'No sessions today')
        return
      }

      const rows = result.projects.map(p => [
        p.project.displayName,
        formatDuration(p.totalMs),
        `${p.sessionCount} session${p.sessionCount === 1 ? '' : 's'}`,
      ])

      const table = compactTable(['Project', 'Time', 'Sessions'], rows)
      process.stdout.write(table + '\n')

      if (result.activeSession) {
        output('started', `Active: ${result.activeSession.project.displayName}  ${formatDuration(result.activeSession.durationMs)}`)
      }

      output('info', `Total: ${formatDuration(result.grandTotalMs)}`)

      // Goal and streak footer
      const config = loadConfig()
      const goalMinutes = config.goal.dailyMinutes
      if (goalMinutes) {
        const todayMinutes = result.grandTotalMs / 60_000
        const percent = Math.min(100, Math.round((todayMinutes / goalMinutes) * 100))
        const goalStr = formatGoalDuration(goalMinutes)
        const todayStr = formatDuration(result.grandTotalMs)

        const streakService = createStreakService()
        const streak = streakService.getStreak(goalMinutes)

        const goalSymbol: 'started' | 'info' = percent >= 100 ? 'started' : 'info'
        output(goalSymbol, `Goal: ${todayStr} / ${goalStr} (${percent}%)`)
        if (streak.current > 0) {
          output('info', `Streak: ${streak.current} day${streak.current === 1 ? '' : 's'}`)
        }
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default todayCommand
