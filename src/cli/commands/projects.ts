import { define } from 'gunshi'
import { formatDuration, output } from '../format'
import { createReportService, handleCommandError } from '../helpers'
import { compactTable } from '../table'

const projectsCommand = define({
  name: 'projects',
  description: 'List all projects with this-week totals',
  args: {},
  run: () => {
    try {
      const service = createReportService()
      const summaries = service.allProjects()

      if (summaries.length === 0) {
        output('idle', 'No projects found')
        return
      }

      const rows = summaries.map(s => [
        s.project.displayName,
        s.project.slug,
        s.totalMs > 0 ? formatDuration(s.totalMs) : '-',
        s.sessionCount > 0 ? `${s.sessionCount}` : '-',
      ])

      const table = compactTable(['Project', 'Slug', 'This Week', 'Sessions'], rows)
      process.stdout.write(table + '\n')
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default projectsCommand
