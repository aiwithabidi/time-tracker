import { getDb } from '../db/client'
import { createRepositories } from '../db/repositories/index'
import { createSessionService as createService, type SessionService } from '../core/session/index'
import { TimeTrackerError } from '../core/session/index'
import { createReportService as createReport, type ReportService } from '../core/reports/index'
import { createReviewService as createReview, type ReviewService } from '../core/review/index'
import { createStreakService as createStreak, type StreakService } from '../core/reports/streak-service'
import { errorOutput } from './format'
import { logCommandEvent, parseCommandFromArgv } from '../core/event-logger'

export function getTerminalId(): string {
  return process.env['TT_TERMINAL_ID'] ?? `pid-${process.pid}`
}

function getRepos(): ReturnType<typeof createRepositories> {
  return createRepositories(getDb())
}

export function createSessionService(): SessionService {
  return createService({ repos: getRepos() })
}

export function createReportService(): ReportService {
  return createReport({ repos: getRepos() })
}

export function createReviewService(): ReviewService {
  return createReview({ repos: getRepos() })
}

export function createStreakService(): StreakService {
  return createStreak({ repos: getRepos() })
}

export function handleCommandError(err: unknown): void {
  const parsed = parseCommandFromArgv(process.argv)

  if (parsed.command !== 'pulse') {
    let errorMessage: string
    if (err instanceof TimeTrackerError) {
      errorMessage = err.userMessage
    } else if (err instanceof Error) {
      errorMessage = err.message
    } else {
      errorMessage = 'An unexpected error occurred'
    }
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
