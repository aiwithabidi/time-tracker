import { define } from 'gunshi'
import { output, formatDuration } from '../format'
import { createSessionService, handleCommandError } from '../helpers'
import { loadConfig } from '../../config/config-loader'
import { formatGoalDuration } from '../duration-parsing'

function formatGoalProgress(todayTotalMs: number, goalMinutes: number): string {
  const todayHours = (todayTotalMs / 3_600_000).toFixed(1)
  const goalStr = formatGoalDuration(goalMinutes)
  const percent = Math.min(100, Math.round((todayTotalMs / 60_000 / goalMinutes) * 100))
  return ` (today: ${todayHours}h / ${goalStr} ${percent}%)`
}

const nowCommand = define({
  name: 'now',
  description: 'Show current tracking status',
  args: {
    json: {
      type: 'boolean',
      description: 'Output machine-readable JSON',
    },
  },
  run: (ctx) => {
    try {
      const service = createSessionService()
      const cwd = process.cwd()
      const result = service.now(cwd)
      const config = loadConfig()
      const goalMinutes = config.goal.dailyMinutes

      // JSON output mode
      if (ctx.values.json) {
        const jsonOutput: Record<string, unknown> = {
          active: result.session !== null,
          project: result.project?.slug ?? null,
          durationMs: result.durationMs,
          todayTotalMs: result.todayTotalMs,
          idleState: result.idleState,
        }
        if (goalMinutes) {
          jsonOutput['goalMinutes'] = goalMinutes
          jsonOutput['goalPercent'] = Math.min(100, Math.round((result.todayTotalMs / 60_000 / goalMinutes) * 100))
        }
        process.stdout.write(JSON.stringify(jsonOutput) + '\n')
        return
      }

      // Human output
      if (result.session && result.project) {
        const duration = formatDuration(result.durationMs)
        const todayTotal = formatDuration(result.todayTotalMs)

        const goalSuffix = goalMinutes ? formatGoalProgress(result.todayTotalMs, goalMinutes) : ''

        if (result.idleState === 'paused' && result.session.pausedAt !== null) {
          const breakDuration = formatDuration(Date.now() - result.session.pausedAt)
          output('paused', `${result.project.displayName}  on break (${breakDuration}) \u2014 ${todayTotal} today${goalSuffix}`)
        } else if (result.idleState === 'soft-idle' || result.idleState === 'hard-idle') {
          const idleDuration = formatDuration(result.idleDurationMs)
          output('started', `${result.project.displayName}  ${duration} (idle ${idleDuration} \u2014 today: ${todayTotal})${goalSuffix}`)
        } else {
          output('started', `${result.project.displayName}  ${duration}${goalSuffix || ` (today: ${todayTotal})`}`)
        }
      } else if (result.todaySessionCount > 0) {
        const todayTotal = formatDuration(result.todayTotalMs)
        const goalSuffix = goalMinutes ? formatGoalProgress(result.todayTotalMs, goalMinutes) : ''
        output('idle', `No active session${goalSuffix || ` (today: ${todayTotal} across ${result.todaySessionCount} session${result.todaySessionCount === 1 ? '' : 's'})`}`)
      } else {
        output('idle', 'No active session')
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default nowCommand
