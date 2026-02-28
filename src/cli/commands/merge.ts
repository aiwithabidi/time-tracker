import { define } from 'gunshi'
import { formatDuration, output, errorOutput } from '../format'
import { createSessionService, handleCommandError } from '../helpers'
import { formatTimeRange } from '../table'

const mergeCommand = define({
  name: 'merge',
  description: 'Merge two adjacent sessions',
  args: {
    yes: {
      type: 'boolean' as const,
      short: 'y',
      description: 'Skip confirmation prompt',
    },
    force: {
      type: 'boolean' as const,
      short: 'f',
      description: 'Allow merge with gap > 60 minutes',
    },
  },
  run: async (ctx) => {
    try {
      const id1 = ctx.positionals?.[1]
      const id2 = ctx.positionals?.[2]

      if (!id1 || !id2) {
        errorOutput('Two session IDs required', 'Usage: tt merge <id1> <id2>')
        process.exitCode = 1
        return
      }

      const service = createSessionService()

      const preview = service.previewMerge(id1, id2)

      output('info', 'Merge preview:')
      output('info', `  ${preview.earlier.id.slice(0, 8)} ${formatTimeRange(preview.earlier.startTime, preview.earlier.endTime)}`)
      output('info', `  ${preview.later.id.slice(0, 8)} ${formatTimeRange(preview.later.startTime, preview.later.endTime)}`)

      if (preview.gapMs > 0) {
        output('info', `  Gap: ${formatDuration(preview.gapMs)} (will be treated as idle time)`)
      }

      output('info', `  Merged: ${formatTimeRange(preview.merged.startTime, preview.merged.endTime)}  ${formatDuration(preview.merged.durationMs)} billable`)

      if (preview.requiresForce) {
        if (!ctx.values.force) {
          errorOutput(
            `Gap exceeds 60 minutes (${Math.round(preview.gapMs / 60000)} min)`,
            'Use --force to proceed'
          )
          process.exitCode = 1
          return
        }
        output('info', '  WARNING: Large gap merged with --force')
      }

      if (!ctx.values.yes) {
        if (!process.stdout.isTTY) {
          errorOutput('Non-interactive mode: use --yes to confirm')
          process.exitCode = 1
          return
        }

        const { confirm } = await import('@inquirer/prompts')
        const ok = await confirm({ message: 'Apply this merge?' })
        if (!ok) {
          output('info', 'Cancelled')
          return
        }
      }

      const result = service.merge(id1, id2, ctx.values.force ?? false)
      output('info', `Merge complete: ${result.merged.id.slice(0, 8)}`)
      output('info', `  (originals ${result.removedIds.map(id => id.slice(0, 8)).join(', ')} archived)`)
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default mergeCommand
