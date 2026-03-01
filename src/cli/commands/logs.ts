import { define } from 'gunshi'
import { desc, eq, and, gte, lte, sql } from 'drizzle-orm'
import chalk from 'chalk'
import { getDb } from '../../db/client'
import { commandEvents } from '../../db/schema'
import { handleCommandError } from '../helpers'

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const logsCommand = define({
  name: 'logs',
  description: 'View command event logs for product analytics',
  args: {
    limit: {
      type: 'string',
      short: 'l',
      description: 'Number of events to show (default: 25)',
    },
    command: {
      type: 'string',
      short: 'c',
      description: 'Filter by command name',
    },
    errors: {
      type: 'boolean',
      short: 'e',
      description: 'Show only errors',
    },
    stats: {
      type: 'boolean',
      short: 's',
      description: 'Show usage statistics summary',
    },
    from: {
      type: 'string',
      description: 'Start date (YYYY-MM-DD)',
    },
    to: {
      type: 'string',
      description: 'End date (YYYY-MM-DD)',
    },
    json: {
      type: 'boolean',
      description: 'Output raw JSON for AI analysis',
    },
  },
  run: (ctx) => {
    try {
      const db = getDb()
      const limit = ctx.values.limit ? parseInt(ctx.values.limit, 10) : 25
      const filterCommand = ctx.values.command
      const errorsOnly = ctx.values.errors
      const showStats = ctx.values.stats
      const outputJson = ctx.values.json

      const conditions = []
      if (filterCommand) {
        conditions.push(eq(commandEvents.command, filterCommand))
      }
      if (errorsOnly) {
        conditions.push(eq(commandEvents.success, false))
      }
      if (ctx.values.from) {
        const fromDate = new Date(ctx.values.from)
        fromDate.setHours(0, 0, 0, 0)
        conditions.push(gte(commandEvents.timestamp, fromDate.getTime()))
      }
      if (ctx.values.to) {
        const toDate = new Date(ctx.values.to)
        toDate.setHours(23, 59, 59, 999)
        conditions.push(lte(commandEvents.timestamp, toDate.getTime()))
      }

      if (showStats) {
        printStats(db, conditions)
        return
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined
      const events = db.select()
        .from(commandEvents)
        .where(where)
        .orderBy(desc(commandEvents.timestamp))
        .limit(limit)
        .all()

      if (events.length === 0) {
        process.stdout.write('No events found.\n')
        return
      }

      if (outputJson) {
        process.stdout.write(JSON.stringify(events, null, 2) + '\n')
        return
      }

      const header = `${'Time'.padEnd(14)} ${'Command'.padEnd(18)} ${'ms'.padEnd(7)} ${'Status'}`
      process.stdout.write(chalk.dim(header) + '\n')
      process.stdout.write(chalk.dim('\u2500'.repeat(55)) + '\n')

      for (const event of events) {
        const time = formatTimestamp(event.timestamp)
        const cmd = event.subcommand
          ? `${event.command} ${event.subcommand}`
          : event.command
        const duration = event.durationMs != null ? `${event.durationMs}` : '-'
        const status = event.success
          ? chalk.green('ok')
          : chalk.red('err')
        const errorInfo = event.errorMessage
          ? chalk.dim(` ${event.errorMessage.slice(0, 40)}`)
          : ''

        process.stdout.write(`${time.padEnd(14)} ${cmd.padEnd(18)} ${duration.padEnd(7)} ${status}${errorInfo}\n`)
      }

      process.stdout.write(chalk.dim(`\n${events.length} events shown\n`))
    } catch (error) {
      handleCommandError(error)
    }
  },
})

function printStats(db: ReturnType<typeof getDb>, conditions: unknown[]): void {
  const where = conditions.length > 0 ? and(...(conditions as Parameters<typeof and>)) : undefined

  // Command frequency
  const frequency = db.select({
    command: commandEvents.command,
    count: sql<number>`count(*)`.as('count'),
    avgMs: sql<number>`avg(duration_ms)`.as('avg_ms'),
    errors: sql<number>`sum(case when success = 0 then 1 else 0 end)`.as('errors'),
  })
    .from(commandEvents)
    .where(where)
    .groupBy(commandEvents.command)
    .orderBy(sql`count(*) desc`)
    .all()

  if (frequency.length === 0) {
    process.stdout.write('No events recorded yet.\n')
    return
  }

  const total = frequency.reduce((sum, row) => sum + row.count, 0)
  const totalErrors = frequency.reduce((sum, row) => sum + (row.errors ?? 0), 0)

  process.stdout.write(chalk.bold('Usage Statistics\n'))
  process.stdout.write(chalk.dim('\u2500'.repeat(55)) + '\n')
  process.stdout.write(`Total commands: ${chalk.bold(String(total))}  Errors: ${totalErrors > 0 ? chalk.red(String(totalErrors)) : chalk.green('0')}\n\n`)

  const header = `${'Command'.padEnd(18)} ${'Count'.padEnd(8)} ${'Avg ms'.padEnd(9)} ${'Errors'}`
  process.stdout.write(chalk.dim(header) + '\n')

  for (const row of frequency) {
    const avgMs = row.avgMs != null ? Math.round(row.avgMs).toString() : '-'
    const errors = row.errors > 0 ? chalk.red(String(row.errors)) : chalk.dim('0')
    process.stdout.write(`${row.command.padEnd(18)} ${String(row.count).padEnd(8)} ${avgMs.padEnd(9)} ${errors}\n`)
  }

  // Error breakdown if any
  if (totalErrors > 0) {
    process.stdout.write('\n' + chalk.dim('\u2500'.repeat(55)) + '\n')
    process.stdout.write(chalk.bold('Recent Errors\n'))

    const recentErrors = db.select()
      .from(commandEvents)
      .where(and(eq(commandEvents.success, false), ...(conditions.length > 0 ? (conditions as Parameters<typeof and>) : [])))
      .orderBy(desc(commandEvents.timestamp))
      .limit(5)
      .all()

    for (const err of recentErrors) {
      const time = formatTimestamp(err.timestamp)
      process.stdout.write(`  ${chalk.dim(time)} ${err.command} ${chalk.red(err.errorMessage?.slice(0, 60) ?? 'unknown')}\n`)
    }
  }
}

export default logsCommand
