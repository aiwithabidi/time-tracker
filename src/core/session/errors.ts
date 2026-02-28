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
