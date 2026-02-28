import { define } from 'gunshi'
import { formatDuration, output } from '../format'
import { createReportService, handleCommandError } from '../helpers'
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
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default todayCommand
