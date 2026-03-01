import { define } from 'gunshi'
import { appendFileSync } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createSessionService, getTerminalId } from '../helpers'

const PULSE_ERROR_LOG = path.join(os.homedir(), '.tt', 'pulse-errors.log')

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
    } catch (error) {
      // Hooks must never fail, but log errors for debugging
      try {
        const timestamp = new Date().toISOString()
        const message = error instanceof Error ? error.message : String(error)
        appendFileSync(PULSE_ERROR_LOG, `[${timestamp}] ${message}\n`)
      } catch {
        // If logging itself fails, silently continue
      }
    }
  },
})

export default pulseCommand
