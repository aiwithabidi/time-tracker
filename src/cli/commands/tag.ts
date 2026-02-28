import { define } from 'gunshi'
import { output, errorOutput } from '../format'
import { createSessionService, handleCommandError } from '../helpers'

const tagCommand = define({
  name: 'tag',
  description: 'Manage tags on the current session',
  args: {
    add: {
      type: 'string',
      short: 'a',
      description: 'Tag to add',
    },
    remove: {
      type: 'string',
      short: 'r',
      description: 'Tag to remove',
    },
  },
  run: (ctx) => {
    try {
      const service = createSessionService()
      const cwd = process.cwd()

      const removeTag = ctx.values.remove
      if (removeTag) {
        service.removeTag(cwd, removeTag)
        output('info', `Removed tag: ${removeTag}`)
        return
      }

      // Support both `tt tag -a billable` and `tt tag billable` (positional)
      const addTag = ctx.values.add ?? ctx.positionals?.[0]

      if (!addTag || addTag.trim().length === 0) {
        errorOutput('No tag specified', 'Usage: tt tag billable or tt tag -a billable')
        process.exitCode = 1
        return
      }

      service.addTag(cwd, addTag.trim())
      output('info', `Tagged: ${addTag.trim()}`)
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default tagCommand
