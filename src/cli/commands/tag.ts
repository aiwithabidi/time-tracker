import { define } from 'gunshi'
import { output } from '../format'

const tagCommand = define({
  name: 'tag',
  description: 'Manage tags on the current session',
  args: {
    add: {
      type: 'string',
      description: 'Tag to add',
    },
    remove: {
      type: 'string',
      description: 'Tag to remove',
    },
  },
  run: (ctx) => {
    output('info', `tag command not yet implemented (add: ${ctx.values.add ?? 'none'}, remove: ${ctx.values.remove ?? 'none'})`)
  },
})

export default tagCommand
