import { getDb } from '../db/client'
import { createRepositories } from '../db/repositories/index'
import { createSessionService as createService, type SessionService } from '../core/session/index'
import {
  NoActiveSessionError,
  NoProjectFoundError,
  InvalidTagError,
  SessionNotFoundError,
  AmbiguousIdError,
  NothingToUndoError,
  InvalidTimeRangeError,
  InvalidSplitTimeError,
  MergeValidationError,
} from '../core/session/index'
import { createReportService as createReport, type ReportService } from '../core/reports/index'
import { createReviewService as createReview, type ReviewService } from '../core/review/index'
import { errorOutput } from './format'

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
  if (err instanceof NoActiveSessionError) {
    errorOutput(err.message, err.suggestion)
    process.exitCode = 1
    return
  }

  if (err instanceof NoProjectFoundError) {
    errorOutput(err.message, err.suggestion)
    process.exitCode = 1
    return
  }

  if (err instanceof InvalidTagError) {
    errorOutput(err.message)
    process.exitCode = 1
    return
  }

  if (err instanceof SessionNotFoundError) {
    errorOutput(err.message)
    process.exitCode = 1
    return
  }

  if (err instanceof AmbiguousIdError) {
    errorOutput(err.message)
    process.exitCode = 1
    return
  }

  if (err instanceof NothingToUndoError) {
    errorOutput(err.message)
    process.exitCode = 1
    return
  }

  if (err instanceof InvalidTimeRangeError) {
    errorOutput(err.message)
    process.exitCode = 1
    return
  }

  if (err instanceof InvalidSplitTimeError) {
    errorOutput(err.message)
    process.exitCode = 1
    return
  }

  if (err instanceof MergeValidationError) {
    errorOutput(err.message)
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
