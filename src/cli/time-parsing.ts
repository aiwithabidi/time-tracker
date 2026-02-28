import { DateTime } from 'luxon'

/**
 * Parse a time input for edit commands.
 * Accepts:
 *   - "HH:mm" -- applied to the reference date (session's start date)
 *   - ISO 8601 datetime -- used directly ("2026-02-28T09:00")
 *
 * Returns millisecond timestamp.
 */
export function parseEditTime(input: string, referenceMs: number): number {
  // Try full ISO first
  const full = DateTime.fromISO(input)
  if (full.isValid) return full.toMillis()

  // Try time-only HH:mm
  const referenceDate = DateTime.fromMillis(referenceMs)
  const timeOnly = DateTime.fromFormat(input, 'HH:mm', { zone: referenceDate.zoneName ?? undefined })
  if (timeOnly.isValid) {
    const result = referenceDate.set({
      hour: timeOnly.hour,
      minute: timeOnly.minute,
      second: 0,
      millisecond: 0,
    })
    return result.toMillis()
  }

  throw new Error(`Cannot parse time "${input}". Use HH:mm or ISO 8601 (YYYY-MM-DDTHH:mm).`)
}
