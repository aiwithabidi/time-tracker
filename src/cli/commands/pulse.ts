import { define } from 'gunshi'
import { createSessionService, getTerminalId } from '../helpers'

const pulseCommand = define({
  name: 'pulse',
  description: 'Record an activity heartbeat (used by shell hooks)',
  args: {
    source: {
      type: 'string',
      short: 's',
      description: 'Hook source (claude-startup, claude-resume, post-tool-use, stop, manual)',
      required: true,
    },
    cwd: {
      type: 'string',
      short: 'c',
      description: 'Working directory for project inference',
      required: true,
    },
    'session-id': {
      type: 'string',
      description: 'Claude session ID for correlation',
    },
    'terminal-id': {
      type: 'string',
      short: 't',
      description: 'Override TT_TERMINAL_ID env var',
    },
  },
  run: (ctx) => {
    try {
      const service = createSessionService()
      const terminalId = ctx.values['terminal-id'] ?? getTerminalId()
      const cwd = ctx.values.cwd ?? process.cwd()
      const source = ctx.values.source ?? 'manual'

      service.pulse({
        cwd,
        source,
        terminalId,
        claudeSessionId: ctx.values['session-id'],
      })
    } catch {
      // Swallow all errors -- hooks must never fail
    }
  },
})

export default pulseCommand
