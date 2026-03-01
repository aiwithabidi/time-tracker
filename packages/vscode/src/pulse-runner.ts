import { spawn } from 'child_process'

export interface PulseRunner {
  pulse(source: string, cwd: string): void
  dispose(): void
}

const DEBOUNCE_MS = 5_000
const RATE_LIMIT_MS = 55_000

export function createPulseRunner(binaryPath: string): PulseRunner {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let lastSentAt = 0

  function sendPulse(source: string, cwd: string): void {
    const now = Date.now()
    if (now - lastSentAt < RATE_LIMIT_MS) {
      return
    }

    lastSentAt = now

    try {
      const child = spawn(binaryPath, ['pulse', '--source', source, '--cwd', cwd], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
    } catch {
      // Silently ignore spawn errors to avoid blocking extension host
    }
  }

  function pulse(source: string, cwd: string): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      sendPulse(source, cwd)
    }, DEBOUNCE_MS)
  }

  function dispose(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  return { pulse, dispose }
}
