export class NoActiveSessionError extends Error {
  readonly suggestion: string

  constructor(suggestion: string) {
    super('No active session')
    this.name = 'NoActiveSessionError'
    this.suggestion = suggestion
  }
}

export class NoProjectFoundError extends Error {
  readonly cwd: string
  readonly suggestion: string

  constructor(cwd: string, suggestion: string) {
    super(`Could not determine project for ${cwd}`)
    this.name = 'NoProjectFoundError'
    this.cwd = cwd
    this.suggestion = suggestion
  }
}

export class InvalidTagError extends Error {
  constructor(tag: string) {
    super(`Invalid tag "${tag}": tags must be kebab-case (e.g. "billable", "bug-fix")`)
    this.name = 'InvalidTagError'
  }
}

export class SessionNotFoundError extends Error {
  constructor(prefix: string) {
    super(`No session found matching "${prefix}"`)
    this.name = 'SessionNotFoundError'
  }
}

export class AmbiguousIdError extends Error {
  readonly candidates: string[]
  constructor(prefix: string, candidates: string[]) {
    super(`Ambiguous ID "${prefix}" matches: ${candidates.join(', ')}. Use more characters.`)
    this.name = 'AmbiguousIdError'
    this.candidates = candidates
  }
}

export class NothingToUndoError extends Error {
  constructor() {
    super('Nothing to undo')
    this.name = 'NothingToUndoError'
  }
}

export class InvalidTimeRangeError extends Error {
  constructor(detail: string) {
    super(`Invalid time range: ${detail}`)
    this.name = 'InvalidTimeRangeError'
  }
}
