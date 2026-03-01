import { define } from 'gunshi'
import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createSessionService, getTerminalId } from '../helpers'

const LOGS_DIR = path.join(os.homedir(), '.tt', 'logs')
const MAX_LOG_AGE_DAYS = 30

function getPulseLogPath(): string {
  const date = new Date().toISOString().slice(0, 10)
  mkdirSync(LOGS_DIR, { recursive: true })
  return path.join(LOGS_DIR, `pulse-${date}.log`)
}

function rotateLogs(): void {
  try {
    const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000
    const files = readdirSync(LOGS_DIR).filter((f) => f.startsWith('pulse-'))
    for (const file of files) {
      const match = file.match(/pulse-(\d{4}-\d{2}-\d{2})\.log/)
      if (match) {
        const fileDate = new Date(match[1]!).getTime()
        if (fileDate < cutoff) {
          unlinkSync(path.join(LOGS_DIR, file))
        }
      }
    }
  } catch {
    // Silent fail
  }
}

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
        appendFileSync(getPulseLogPath(), `[${timestamp}] ${message}\n`)
        rotateLogs()
      } catch {
        // If logging itself fails, silently continue
      }
    }
  },
})

export default pulseCommand
