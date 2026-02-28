import { define } from 'gunshi'
import { DateTime } from 'luxon'
import { getDb } from '../../db/client'
import { createRepositories } from '../../db/repositories/index'
import { createExportService } from '../../core/export/export-service'
import { parseDateFlag } from '../date-parsing'
import { formatDuration, errorOutput } from '../format'
import { handleCommandError } from '../helpers'

const exportCommand = define({
  name: 'export',
  description: 'Export time data (usage: tt export csv [flags])',
  args: {
    project: {
      type: 'string' as const,
      short: 'p',
      description: 'Filter by project slug',
    },
    from: {
      type: 'string' as const,
      description: 'Start date (YYYY-MM-DD or keyword)',
    },
    to: {
      type: 'string' as const,
      description: 'End date (YYYY-MM-DD or keyword)',
    },
    'dry-run': {
      type: 'boolean' as const,
      description: 'Preview without outputting CSV',
    },
  },
  run: (ctx) => {
    try {
      const format = ctx.positionals?.[1]
      if (format !== 'csv') {
        errorOutput(
          'Usage: tt export csv [--project=x] [--from=DATE] [--to=DATE] [--dry-run]',
        )
        process.exitCode = 1
        return
      }

      const db = getDb()
      const repos = createRepositories(db)
      const exportService = createExportService(repos)
      const timezone = DateTime.local().zoneName ?? 'UTC'

      const fromDate = ctx.values.from
        ? parseDateFlag(ctx.values.from).toMillis()
        : undefined
      const toDate = ctx.values.to
        ? parseDateFlag(ctx.values.to).endOf('day').toMillis()
        : undefined

      const sessions = exportService.getSessionsForExport({
        from: fromDate,
        to: toDate,
        projectSlug: ctx.values.project,
      })

      if (sessions.length === 0) {
        process.stderr.write('No sessions found matching the given filters.\n')
        return
      }

      if (ctx.values['dry-run']) {
        const summary = exportService.getDryRunSummary(sessions)
        const durationStr = formatDuration(summary.totalMs)
        const projectSuffix = ctx.values.project
          ? ` for ${ctx.values.project}`
          : ''
        process.stderr.write(
          `Would export ${summary.count} session${summary.count !== 1 ? 's' : ''} (${durationStr})${projectSuffix}\n`,
        )
        return
      }

      const csv = exportService.toCSV(sessions, timezone)
      process.stdout.write(csv)
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default exportCommand
