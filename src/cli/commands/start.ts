import { define } from 'gunshi'
import { output, formatDuration } from '../format'
import { createSessionService, handleCommandError, getTerminalId } from '../helpers'

const startCommand = define({
  name: 'start',
  description: 'Start tracking time on a project',
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

      const result = service.start(cwd, terminalId, {
        projectOverride: ctx.values.project,
      })

      if (result.staleSessionClosed) {
        const staleDuration = formatDuration(result.staleSessionClosed.duration)
        output('info', `Closed stale session (${staleDuration} from earlier).`)
      }

      const projectName = result.project.displayName

      switch (result.action) {
        case 'created':
          output('started', `Started ${projectName} (${result.source})`)
          break
        case 'attached':
          output('started', `Attached to ${projectName} (${result.source})`)
          break
        case 'already_active': {
          const duration = formatDuration(Date.now() - result.session.startTime - result.session.idleDeductedMs)
          output('started', `${projectName}  ${duration}`)
          break
        }
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default startCommand
