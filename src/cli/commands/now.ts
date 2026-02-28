import { define } from 'gunshi'
import { output } from '../format'

const nowCommand = define({
  name: 'now',
  description: 'Show current tracking status',
  args: {},
  run: () => {
    output('info', 'now command not yet implemented')
  },
})

export default nowCommand
