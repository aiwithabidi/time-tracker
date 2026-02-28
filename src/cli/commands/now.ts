import { define } from 'gunshi'
import { output, formatDuration } from '../format'
import { createSessionService, handleCommandError } from '../helpers'

const nowCommand = define({
  name: 'now',
  description: 'Show current tracking status',
  args: {},
  run: () => {
    try {
      const service = createSessionService()
      const cwd = process.cwd()

      const result = service.now(cwd)

      if (result.session && result.project) {
        const duration = formatDuration(result.durationMs)
        const todayTotal = formatDuration(result.todayTotalMs)

        if (result.idleState === 'paused' && result.session.pausedAt !== null) {
          const breakDuration = formatDuration(Date.now() - result.session.pausedAt)
          output('paused', `${result.project.displayName}  on break (${breakDuration}) \u2014 ${todayTotal} today`)
        } else if (result.idleState === 'soft-idle' || result.idleState === 'hard-idle') {
          const idleDuration = formatDuration(result.idleDurationMs)
          output('started', `${result.project.displayName}  ${duration} (idle ${idleDuration} \u2014 today: ${todayTotal})`)
        } else {
          output('started', `${result.project.displayName}  ${duration} (today: ${todayTotal})`)
        }
      } else if (result.todaySessionCount > 0) {
        const todayTotal = formatDuration(result.todayTotalMs)
        output('idle', `No active session (today: ${todayTotal} across ${result.todaySessionCount} session${result.todaySessionCount === 1 ? '' : 's'})`)
      } else {
        output('idle', 'No active session')
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default nowCommand
