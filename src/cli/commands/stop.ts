import { define } from 'gunshi'
import { output } from '../format'

const stopCommand = define({
  name: 'stop',
  description: 'Stop the current time tracking session',
  args: {
    project: {
      type: 'string',
      short: 'p',
      description: 'Project slug or name',
    },
  },
  run: (ctx) => {
    output('info', `stop command not yet implemented (project: ${ctx.values.project ?? 'auto-detect'})`)
  },
})

export default stopCommand
