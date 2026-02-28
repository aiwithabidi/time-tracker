export const CSV_HEADERS = [
  'project', 'date', 'start_time', 'end_time',
  'duration_hours', 'duration_human', 'notes', 'tags',
] as const

export function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toCSVRow(fields: readonly string[]): string {
  return fields.map(escapeCSVField).join(',')
}
