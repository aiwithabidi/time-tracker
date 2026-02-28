import { define } from 'gunshi'
import { output, errorOutput } from '../format'
import { createSessionService, handleCommandError } from '../helpers'

const noteCommand = define({
  name: 'note',
  description: 'Add a note to the current session',
  args: {
    message: {
      type: 'string',
      short: 'm',
      description: 'Note content',
    },
  },
  run: (ctx) => {
    try {
      const service = createSessionService()
      const cwd = process.cwd()

      // Support both `tt note -m "text"` and `tt note "text"` (positional)
      // positionals[0] is the command name ("note"), positionals[1] is the actual argument
      const text = ctx.values.message ?? ctx.positionals?.[1]

      if (!text || text.trim().length === 0) {
        errorOutput('No note text provided', 'Usage: tt note -m "your note" or tt note "your note"')
        process.exitCode = 1
        return
      }

      service.addNote(cwd, text.trim())
      output('info', 'Note added')
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default noteCommand
