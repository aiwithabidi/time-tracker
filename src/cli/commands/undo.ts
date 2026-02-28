import { define } from 'gunshi'
import { output } from '../format'
import { createSessionService, handleCommandError } from '../helpers'

const undoCommand = define({
  name: 'undo',
  description: 'Undo the last state-changing operation',
  args: {},
  run: () => {
    try {
      const service = createSessionService()
      const result = service.undo()

      output('info', `Undid "${result.operation}"`)
      for (const id of result.restoredSessionIds) {
        output('info', `  Restored session ${id.slice(0, 8)}`)
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default undoCommand
