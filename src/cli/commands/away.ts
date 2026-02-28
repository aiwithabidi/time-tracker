import { define } from 'gunshi'
import { output, formatDuration } from '../format'
import { createSessionService, handleCommandError } from '../helpers'

const awayCommand = define({
  name: 'away',
  description: 'Take a break from the current session',
  args: {},
  run: () => {
    try {
      const service = createSessionService()
      const cwd = process.cwd()

      const result = service.away(cwd)
      const projectName = result.project.displayName

      if (result.action === 'already_paused' && result.pauseDurationMs !== undefined) {
        const duration = formatDuration(result.pauseDurationMs)
        output('paused', `Already on break from ${projectName} (${duration} so far)`)
      } else {
        output('paused', `Taking a break from ${projectName}`)
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default awayCommand
