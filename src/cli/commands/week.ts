import { define } from 'gunshi'
import { formatDuration, output } from '../format'
import { createReportService, handleCommandError } from '../helpers'
import { borderedTable } from '../table'

const weekCommand = define({
  name: 'week',
  description: "Show this week's time report",
  args: {
    project: {
      type: 'string' as const,
      short: 'p',
      description: 'Filter by project slug',
    },
  },
  run: (ctx) => {
    try {
      const service = createReportService()
      const result = service.week(ctx.values.project)

      if (result.projects.length === 0) {
        output('idle', `No sessions this week (${result.weekStart} to ${result.weekEnd})`)
        return
      }

      output('info', `Week: ${result.weekStart} to ${result.weekEnd}`)

      const rows = result.projects.map(p => [
        p.project.displayName,
        formatDuration(p.totalMs),
        `${p.sessionCount}`,
      ])

      const table = borderedTable(
        ['Project', 'Time', 'Sessions'],
        rows,
        ['Total', formatDuration(result.grandTotalMs), ''],
      )
      process.stdout.write(table + '\n')
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default weekCommand
