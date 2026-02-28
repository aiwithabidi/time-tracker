import { define } from 'gunshi'
import { formatDuration, output, formatCurrency } from '../format'
import { createReportService, handleCommandError } from '../helpers'
import { borderedTable } from '../table'

const weekCommand = define({
  name: 'week',
  description: "Show this week's time report",
  args: {
    project: {
      type: 'string' as const,
      short: 'p',
      description: 'Filter by project slug',
    },
    billable: {
      type: 'boolean' as const,
      short: 'b',
      description: 'Show billable amounts',
    },
  },
  run: (ctx) => {
    try {
      const service = createReportService()
      const result = service.week(ctx.values.project)

      if (result.projects.length === 0) {
        output('idle', `No sessions this week (${result.weekStart} to ${result.weekEnd})`)
        return
      }

      output('info', `Week: ${result.weekStart} to ${result.weekEnd}`)

      const showBillable = ctx.values.billable === true
      const headers = showBillable
        ? ['Project', 'Time', 'Sessions', 'Amount']
        : ['Project', 'Time', 'Sessions']

      let billableTotal = 0
      const rows = result.projects.map(p => {
        const baseRow = [
          p.project.displayName,
          formatDuration(p.totalMs),
          `${p.sessionCount}`,
        ]
        if (showBillable) {
          const hours = p.totalMs / 3_600_000
          if (p.project.hourlyRate) {
            const amount = hours * p.project.hourlyRate
            billableTotal += amount
            baseRow.push(formatCurrency(amount, p.project.currency ?? 'USD'))
          } else {
            baseRow.push('--')
          }
        }
        return baseRow
      })

      const footerRow = showBillable
        ? ['Total', formatDuration(result.grandTotalMs), '', billableTotal > 0 ? formatCurrency(billableTotal, 'USD') : '']
        : ['Total', formatDuration(result.grandTotalMs), '']

      const table = borderedTable(headers, rows, footerRow)
      process.stdout.write(table + '\n')
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default weekCommand
