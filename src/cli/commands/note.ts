import { define } from 'gunshi'
import { output } from '../format'

const noteCommand = define({
  name: 'note',
  description: 'Add a note to the current session',
  args: {
    message: {
      type: 'string',
      short: 'm',
      description: 'Note content',
      required: true,
    },
  },
  run: (ctx) => {
    output('info', `note command not yet implemented (message: ${ctx.values.message})`)
  },
})

export default noteCommand
