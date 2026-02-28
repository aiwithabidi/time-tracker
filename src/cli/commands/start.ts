import { define } from 'gunshi'
import { output } from '../format'

const startCommand = define({
  name: 'start',
  description: 'Start tracking time on a project',
  args: {
    project: {
      type: 'string',
      short: 'p',
      description: 'Project slug or name',
    },
  },
  run: (ctx) => {
    output('info', `start command not yet implemented (project: ${ctx.values.project ?? 'auto-detect'})`)
  },
})

export default startCommand
