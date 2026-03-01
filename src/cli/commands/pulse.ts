import { define } from 'gunshi'
import { appendFileSync, mkdirSync } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createSessionService, getTerminalId } from '../helpers'

const LOGS_DIR = path.join(os.homedir(), '.tt', 'logs')

function getPulseLogPath(): string {
  const date = new Date().toISOString().slice(0, 10)
  mkdirSync(LOGS_DIR, { recursive: true })
  return path.join(LOGS_DIR, `pulse-${date}.log`)
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
    const MAX_RETRIES = 3
    const RETRY_DELAY_MS = 50

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        return // Success — exit immediately
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const isLockError = message.includes('database is locked') || message.includes('database is busy')

        if (isLockError && attempt < MAX_RETRIES) {
          // Jittered backoff: 50-100ms, 100-200ms, 150-300ms
          const delay = RETRY_DELAY_MS * (attempt + 1) + Math.random() * RETRY_DELAY_MS * (attempt + 1)
          Bun.sleepSync(delay)
          continue
        }

        // Final attempt failed or non-lock error — log and exit silently
        try {
          const timestamp = new Date().toISOString()
          appendFileSync(getPulseLogPath(), `[${timestamp}] ${message}\n`)
        } catch {
          // If logging itself fails, silently continue
        }
        return
      }
    }
  },
})

export default pulseCommand
