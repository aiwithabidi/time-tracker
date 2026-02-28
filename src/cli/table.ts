import Table from 'cli-table3'
import chalk from 'chalk'

/** Borderless compact table for today/log output */
export function compactTable(headers: string[], rows: string[][]): string {
  const table = new Table({
    head: headers.map(h => chalk.dim(h)),
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: '  ',
    },
    style: { 'padding-left': 0, 'padding-right': 1, head: [], border: [] },
  })

  for (const row of rows) {
    table.push(row)
  }

  return table.toString()
}

/** Bordered table for week summary */
export function borderedTable(headers: string[], rows: string[][], footerRow?: string[]): string {
  const table = new Table({
    head: headers.map(h => chalk.bold(h)),
    style: { head: [], border: [] },
  })

  for (const row of rows) {
    table.push(row)
  }

  if (footerRow) {
    table.push(footerRow.map(cell => chalk.bold(cell)))
  }

  return table.toString()
}

/** Format a time range like "09:15 - 10:30" from ms timestamps */
export function formatTimeRange(startMs: number, endMs: number | null): string {
  const start = new Date(startMs)
  const end = endMs ? new Date(endMs) : null
  const startStr = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const endStr = end
    ? end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : chalk.green('now')
  return `${startStr} - ${endStr}`
}
