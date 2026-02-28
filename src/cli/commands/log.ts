import { define } from 'gunshi'
import chalk from 'chalk'
import { formatDuration, output } from '../format'
import { createReportService, handleCommandError } from '../helpers'
import { compactTable, formatTimeRange } from '../table'
import { parseDateRange } from '../date-parsing'

const logCommand = define({
  name: 'log',
  description: 'Show session history',
  args: {
    project: {
      type: 'string' as const,
      short: 'p',
      description: 'Filter by project slug',
    },
    from: {
      type: 'string' as const,
      description: 'Start date (YYYY-MM-DD or shortcut)',
    },
    to: {
      type: 'string' as const,
      description: 'End date (YYYY-MM-DD or shortcut)',
    },
  },
  run: (ctx) => {
    try {
      const service = createReportService()
      const { fromIso, toIso } = parseDateRange(ctx.values.from, ctx.values.to)

      const days = service.log({
        projectSlug: ctx.values.project,
        from: fromIso,
        to: toIso,
      })

      if (days.length === 0) {
        output('idle', 'No sessions found')
        return
      }

      for (const day of days) {
        process.stdout.write(chalk.bold(day.displayDate) + '  ' + chalk.dim(formatDuration(day.totalMs)) + '\n')

        const rows = day.sessions.map(s => [
          formatTimeRange(s.session.startTime, s.session.endTime),
          s.project.displayName,
          formatDuration(s.durationMs),
        ])

        const table = compactTable(['Time', 'Project', 'Duration'], rows)
        process.stdout.write(table + '\n\n')
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default logCommand
