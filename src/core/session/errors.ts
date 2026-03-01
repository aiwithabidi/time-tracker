/**
 * Base error class for all TimeTracker domain errors.
 * Provides a userMessage for display and an optional suggestion.
 */
export class TimeTrackerError extends Error {
  readonly userMessage: string
  readonly suggestion?: string

  constructor(userMessage: string, suggestion?: string) {
    super(userMessage)
    this.name = 'TimeTrackerError'
    this.userMessage = userMessage
    this.suggestion = suggestion
  }
}

export class NoActiveSessionError extends TimeTrackerError {
  constructor(suggestion: string) {
    super('No active session', suggestion)
    this.name = 'NoActiveSessionError'
  }
}

export class NoProjectFoundError extends TimeTrackerError {
  readonly cwd: string

  constructor(cwd: string, suggestion: string) {
    super(`Could not determine project for ${cwd}`, suggestion)
    this.name = 'NoProjectFoundError'
    this.cwd = cwd
  }
}

export class InvalidTagError extends TimeTrackerError {
  constructor(tag: string) {
    super(`Invalid tag "${tag}": tags must be kebab-case (e.g. "billable", "bug-fix")`)
    this.name = 'InvalidTagError'
  }
}

export class SessionNotFoundError extends TimeTrackerError {
  constructor(prefix: string) {
    super(`No session found matching "${prefix}"`)
    this.name = 'SessionNotFoundError'
  }
}

export class AmbiguousIdError extends TimeTrackerError {
  readonly candidates: string[]
  constructor(prefix: string, candidates: string[]) {
    super(`Ambiguous ID "${prefix}" matches: ${candidates.join(', ')}. Use more characters.`)
    this.name = 'AmbiguousIdError'
    this.candidates = candidates
  }
}

export class NothingToUndoError extends TimeTrackerError {
  constructor() {
    super('Nothing to undo')
    this.name = 'NothingToUndoError'
  }
}

export class InvalidTimeRangeError extends TimeTrackerError {
  constructor(detail: string) {
    super(`Invalid time range: ${detail}`)
    this.name = 'InvalidTimeRangeError'
  }
}

export class InvalidSplitTimeError extends TimeTrackerError {
  constructor(splitTime: number, startTime: number, endTime: number) {
    const fmt = (ms: number) => new Date(ms).toISOString()
    super(`Split time ${fmt(splitTime)} is outside session bounds ${fmt(startTime)} - ${fmt(endTime)}`)
    this.name = 'InvalidSplitTimeError'
  }
}

export class MergeValidationError extends TimeTrackerError {
  constructor(reason: string) {
    super(`Cannot merge: ${reason}`)
    this.name = 'MergeValidationError'
  }
}
