import { getDb } from '../db/client'
import { createRepositories } from '../db/repositories/index'
import { createSessionService as createService, type SessionService } from '../core/session/index'
import { TimeTrackerError } from '../core/session/index'
import { createReportService as createReport, type ReportService } from '../core/reports/index'
import { createReviewService as createReview, type ReviewService } from '../core/review/index'
import { errorOutput } from './format'
import { logCommandEvent, parseCommandFromArgv } from '../core/event-logger'

export function getTerminalId(): string {
  return process.env['TT_TERMINAL_ID'] ?? `pid-${process.pid}`
}

export function createSessionService(): SessionService {
  const db = getDb()
  const repos = createRepositories(db)

  return createService({ repos })
}

export function createReportService(): ReportService {
  const db = getDb()
  const repos = createRepositories(db)
  return createReport({ repos })
}

export function createReviewService(): ReviewService {
  const db = getDb()
  const repos = createRepositories(db)
  return createReview({ repos })
}

export function handleCommandError(err: unknown): void {
  const parsed = parseCommandFromArgv(process.argv)

  if (parsed.command !== 'pulse') {
    const errorMessage = err instanceof TimeTrackerError
      ? err.userMessage
      : err instanceof Error
        ? err.message
        : 'An unexpected error occurred'
    const errorType = err instanceof Error ? err.constructor.name : 'Unknown'

    logCommandEvent({
      command: parsed.command,
      subcommand: parsed.subcommand,
      args: parsed.args,
      success: false,
      errorMessage,
      errorType,
      cwd: process.cwd(),
    })
  }

  if (err instanceof TimeTrackerError) {
    errorOutput(err.userMessage, err.suggestion)
    process.exitCode = 1
    return
  }

  if (err instanceof Error) {
    errorOutput(err.message)
    process.exitCode = 1
    return
  }

  errorOutput('An unexpected error occurred')
  process.exitCode = 1
}
