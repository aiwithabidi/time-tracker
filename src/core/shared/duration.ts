/**
 * Compute the effective duration of a session in milliseconds.
 * Works with any object that has startTime, optional endTime, and idleDeductedMs.
 */
export function computeSessionDuration(session: {
  readonly startTime: number
  readonly endTime: number | null | undefined
  readonly idleDeductedMs: number
}): number {
  const end = session.endTime ?? Date.now()
  return Math.max(0, end - session.startTime - session.idleDeductedMs)
}
