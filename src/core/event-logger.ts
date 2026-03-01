import { randomUUID } from 'node:crypto'
import { getDb } from '../db/client'
import { commandEvents } from '../db/schema'

export interface CommandEvent {
  readonly command: string
  readonly subcommand?: string
  readonly args?: string
  readonly durationMs?: number
  readonly success: boolean
  readonly errorMessage?: string
  readonly errorType?: string
  readonly projectSlug?: string
  readonly sessionId?: string
  readonly cwd?: string
}

export function logCommandEvent(event: CommandEvent): void {
  try {
    const db = getDb()
    db.insert(commandEvents).values({
      id: randomUUID(),
      command: event.command,
      subcommand: event.subcommand ?? null,
      args: event.args ?? null,
      durationMs: event.durationMs ?? null,
      success: event.success,
      errorMessage: event.errorMessage ?? null,
      errorType: event.errorType ?? null,
      projectSlug: event.projectSlug ?? null,
      sessionId: event.sessionId ?? null,
      cwd: event.cwd ?? null,
      timestamp: Date.now(),
    }).run()
  } catch {
    // Event logging must never break the CLI
  }
}

export function parseCommandFromArgv(argv: readonly string[]): {
  command: string
  subcommand?: string
  args: string
} {
  const args = argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('-'))
  const flags = args.filter((a) => a.startsWith('-'))

  return {
    command: positional[0] ?? 'help',
    subcommand: positional[1],
    args: flags.join(' '),
  }
}
