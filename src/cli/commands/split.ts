import { define } from 'gunshi'
import { formatDuration, output, errorOutput } from '../format'
import { createSessionService, handleCommandError } from '../helpers'
import { formatTimeRange } from '../table'

const splitCommand = define({
  name: 'split',
  description: 'Split a session at a given time',
  args: {
    yes: {
      type: 'boolean' as const,
      short: 'y',
      description: 'Skip confirmation prompt',
    },
  },
  run: async (ctx) => {
    try {
      const sessionId = ctx.positionals?.[1]
      const splitTime = ctx.positionals?.[2]

      if (!sessionId || !splitTime) {
        errorOutput('Session ID and split time required', 'Usage: tt split <id> <HH:mm>')
        process.exitCode = 1
        return
      }

      const service = createSessionService()

      const preview = service.previewSplit(sessionId, splitTime)

      output('info', 'Split preview:')
      output('info', `  Session A  ${formatTimeRange(preview.sessionA.startTime, preview.sessionA.endTime)}  ${formatDuration(preview.sessionA.durationMs)}`)
      output('info', `  Session B  ${formatTimeRange(preview.sessionB.startTime, preview.sessionB.endTime)}  ${formatDuration(preview.sessionB.durationMs)}`)

      if (preview.original.idleDeductedMs > 0) {
        output('info', `  (${formatDuration(preview.original.idleDeductedMs)} idle split proportionally)`)
      }

      if (!ctx.values.yes) {
        if (!process.stdout.isTTY) {
          errorOutput('Non-interactive mode: use --yes to confirm')
          process.exitCode = 1
          return
        }

        const { confirm } = await import('@inquirer/prompts')
        const ok = await confirm({ message: 'Apply this split?' })
        if (!ok) {
          output('info', 'Cancelled')
          return
        }
      }

      const result = service.split(sessionId, splitTime)
      output('info', 'Split complete:')
      output('info', `  Session A: ${result.sessionA.id.slice(0, 8)}`)
      output('info', `  Session B: ${result.sessionB.id.slice(0, 8)}`)
      output('info', `  (original ${result.originalId.slice(0, 8)} archived)`)
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default splitCommand
