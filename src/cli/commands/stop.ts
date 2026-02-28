import { define } from 'gunshi'
import { output, formatDuration } from '../format'
import { createSessionService, handleCommandError, getTerminalId } from '../helpers'

const stopCommand = define({
  name: 'stop',
  description: 'Stop the current time tracking session',
  args: {
    project: {
      type: 'string',
      short: 'p',
      description: 'Project slug or name',
    },
  },
  run: (ctx) => {
    try {
      const service = createSessionService()
      const terminalId = getTerminalId()
      const cwd = process.cwd()

      const result = service.stop(cwd, terminalId, {
        projectOverride: ctx.values.project,
      })

      const duration = formatDuration(result.durationMs)
      output('stopped', `Stopped ${result.project.displayName} \u2014 ${duration}`)
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default stopCommand
