import { define } from 'gunshi'
import { formatDuration, output } from '../format'
import { createReportService, handleCommandError } from '../helpers'
import { formatTimeRange } from '../table'
import { DateTime } from 'luxon'

const lastCommand = define({
  name: 'last',
  description: 'Show the last completed session',
  args: {},
  run: () => {
    try {
      const service = createReportService()
      const result = service.last()

      if (!result) {
        output('idle', 'No completed sessions found')
        return
      }

      const dt = DateTime.fromMillis(result.session.startTime)
      const dateStr = dt.toFormat('ccc dd LLL yyyy')
      const timeRange = formatTimeRange(result.session.startTime, result.session.endTime)

      output('stopped', `${result.project.displayName}  ${timeRange}  ${formatDuration(result.durationMs)}`)
      process.stdout.write(`  ${dateStr}\n`)
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default lastCommand
