import { define } from 'gunshi'
import { output, errorOutput } from '../format'
import { createSessionService, handleCommandError } from '../helpers'

const editCommand = define({
  name: 'edit',
  description: 'Edit a past session',
  args: {
    start: {
      type: 'string' as const,
      description: 'New start time (HH:mm or ISO 8601)',
    },
    end: {
      type: 'string' as const,
      description: 'New end time (HH:mm or ISO 8601)',
    },
    project: {
      type: 'string' as const,
      short: 'p',
      description: 'Reassign to project slug',
    },
    note: {
      type: 'string' as const,
      short: 'n',
      description: 'Append a note',
    },
    tag: {
      type: 'string' as const,
      short: 't',
      description: 'Add a tag',
    },
    untag: {
      type: 'string' as const,
      description: 'Remove a tag',
    },
  },
  run: (ctx) => {
    try {
      // positionals[0] = "edit", positionals[1] = session ID prefix
      const sessionId = ctx.positionals?.[1]
      if (!sessionId) {
        errorOutput('Session ID required', 'Usage: tt edit <id> --start 09:00 --end 10:30')
        process.exitCode = 1
        return
      }

      const { start, end, project, note, tag, untag } = ctx.values
      if (!start && !end && !project && !note && !tag && !untag) {
        errorOutput('No changes specified', 'Use --start, --end, --project, --note, --tag, or --untag')
        process.exitCode = 1
        return
      }

      const service = createSessionService()
      const result = service.edit(sessionId, { start, end, project, note, tag, untag })

      output('info', `Edited session ${result.session.id.slice(0, 8)}`)
      for (const change of result.changes) {
        output('info', `  ${change}`)
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default editCommand
