import { DateTime } from 'luxon'

const SHORTCUTS: Record<string, () => DateTime> = {
  today: () => DateTime.now().startOf('day'),
  yesterday: () => DateTime.now().minus({ days: 1 }).startOf('day'),
  monday: () => DateTime.now().startOf('week'),
  tuesday: () => DateTime.now().startOf('week').plus({ days: 1 }),
  wednesday: () => DateTime.now().startOf('week').plus({ days: 2 }),
  thursday: () => DateTime.now().startOf('week').plus({ days: 3 }),
  friday: () => DateTime.now().startOf('week').plus({ days: 4 }),
  saturday: () => DateTime.now().startOf('week').plus({ days: 5 }),
  sunday: () => DateTime.now().startOf('week').plus({ days: 6 }),
}

export function parseDateFlag(value: string): DateTime {
  const lower = value.toLowerCase()
  const shortcutFn = SHORTCUTS[lower]
  if (shortcutFn) {
    return shortcutFn()
  }

  const dt = DateTime.fromISO(value)
  if (!dt.isValid) {
    throw new Error(
      `Invalid date: "${value}". Use YYYY-MM-DD or a shortcut (today, yesterday, monday..sunday).`
    )
  }
  return dt
}

export function parseDateRange(from?: string, to?: string): { fromIso?: string; toIso?: string } {
  return {
    fromIso: from ? parseDateFlag(from).toISODate()! : undefined,
    toIso: to ? parseDateFlag(to).toISODate()! : undefined,
  }
}
