import { define } from 'gunshi'
import { loadConfig, saveConfig } from '../../config/config-loader'
import { output, errorOutput, formatDuration } from '../format'
import { createReportService, handleCommandError } from '../helpers'
import { parseDuration, formatGoalDuration } from '../duration-parsing'

function handleSet(positionals: readonly string[]): void {
  const durationStr = positionals[2]

  if (!durationStr) {
    errorOutput(
      'Usage: tt goal set <duration>',
      'Examples: tt goal set 6h, tt goal set 4h30m, tt goal set 90m',
    )
    process.exitCode = 1
    return
  }

  let minutes: number
  try {
    minutes = parseDuration(durationStr)
  } catch {
    errorOutput(
      `Invalid duration: "${durationStr}"`,
      'Use formats like "6h", "90m", or "2h 30m"',
    )
    process.exitCode = 1
    return
  }

  if (minutes === 0) {
    errorOutput('Goal must be greater than 0', 'Use "tt goal clear" to remove your goal')
    process.exitCode = 1
    return
  }

  const config = loadConfig()
  const updatedConfig = {
    ...config,
    goal: { dailyMinutes: minutes },
  }
  saveConfig(updatedConfig)
  output('info', `Daily goal set: ${formatGoalDuration(minutes)}`)
}

function handleShow(): void {
  const config = loadConfig()
  const goalMinutes = config.goal.dailyMinutes

  if (!goalMinutes) {
    output('idle', 'No daily goal set')
    output('info', 'Set one with: tt goal set 6h')
    return
  }

  const service = createReportService()
  const today = service.today()
  const todayMs = today.grandTotalMs
  const todayMinutes = todayMs / 60_000
  const percent = Math.min(100, Math.round((todayMinutes / goalMinutes) * 100))

  const progressBar = buildProgressBar(percent, 20)
  const goalStr = formatGoalDuration(goalMinutes)
  const todayStr = formatDuration(todayMs)

  if (percent >= 100) {
    output('started', `Goal: ${todayStr} / ${goalStr} ${progressBar} ${percent}%`)
  } else {
    output('info', `Goal: ${todayStr} / ${goalStr} ${progressBar} ${percent}%`)
  }
}

function handleClear(): void {
  const config = loadConfig()
  const updatedConfig = {
    ...config,
    goal: {},
  }
  saveConfig(updatedConfig)
  output('info', 'Daily goal cleared')
}

function buildProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width)
  const empty = width - filled
  return '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + ']'
}

const goalCommand = define({
  name: 'goal',
  description: 'Manage daily time goal (usage: tt goal set|show|clear)',
  args: {},
  run: (ctx) => {
    try {
      const subcommand = ctx.positionals?.[1]

      switch (subcommand) {
        case 'set':
          return handleSet(ctx.positionals ?? [])
        case 'show':
          return handleShow()
        case 'clear':
          return handleClear()
        default:
          return handleShow()
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default goalCommand
