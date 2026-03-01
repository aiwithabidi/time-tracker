export function parseDuration(input: string): number {
  const trimmed = input?.trim().toLowerCase() ?? ''
  if (trimmed === '') {
    throw new Error('Duration input must be a non-empty string.')
  }

  const match = trimmed.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?$/)
  if (!match || (!match[1] && !match[2])) {
    throw new Error(`Invalid duration format: "${input}". Use formats like "6h", "90m", or "2h 30m".`)
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0
  const minutes = match[2] ? parseInt(match[2], 10) : 0

  return hours * 60 + minutes
}

export function formatGoalDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60

  if (hours > 0 && remaining > 0) {
    return `${hours}h ${remaining}m`
  }
  if (hours > 0) {
    return `${hours}h`
  }
  return `${remaining}m`
}
