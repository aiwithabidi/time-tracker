import { define } from 'gunshi'
import { output, formatDuration } from '../format'
import { createSessionService, handleCommandError, getTerminalId } from '../helpers'

const backCommand = define({
  name: 'back',
  description: 'Resume tracking after a break',
  args: {},
  run: () => {
    try {
      const service = createSessionService()
      const cwd = process.cwd()
      const terminalId = getTerminalId()

      const result = service.back(cwd, terminalId)
      const projectName = result.project.displayName
      const duration = formatDuration(result.breakDurationMs)

      output('started', `Back on ${projectName} \u2014 ${duration} break deducted`)
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default backCommand
