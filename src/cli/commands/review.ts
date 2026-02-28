import { define } from 'gunshi'
import { DateTime } from 'luxon'
import { getDb } from '../../db/client'
import { createRepositories } from '../../db/repositories/index'
import { createReviewService } from '../../core/review/review-service'
import { parseDateFlag } from '../date-parsing'
import { formatDuration, errorOutput, output } from '../format'
import { handleCommandError } from '../helpers'
import Table from 'cli-table3'

const reviewCommand = define({
  name: 'review',
  description: 'Manage work reviews (usage: tt review gather|list|show|save|delete)',
  args: {
    project: {
      type: 'string' as const,
      short: 'p',
      description: 'Filter by project slug',
    },
    from: {
      type: 'string' as const,
      description: 'Start date (YYYY-MM-DD or keyword)',
    },
    to: {
      type: 'string' as const,
      description: 'End date (YYYY-MM-DD or keyword)',
    },
    spread: {
      type: 'string' as const,
      description: 'Spread work across N weekdays',
    },
    limit: {
      type: 'string' as const,
      short: 'l',
      description: 'Limit number of results',
    },
    title: {
      type: 'string' as const,
      description: 'Review title (for save)',
    },
    audience: {
      type: 'string' as const,
      description: 'Review audience: client|developer|email|custom (for save)',
    },
    content: {
      type: 'string' as const,
      description: 'Review content (for save, reads from stdin if omitted)',
    },
    'period-start': {
      type: 'string' as const,
      description: 'Period start epoch ms (for save)',
    },
    'period-end': {
      type: 'string' as const,
      description: 'Period end epoch ms (for save)',
    },
    'total-ms': {
      type: 'string' as const,
      description: 'Total duration in ms (for save)',
    },
    'raw-data': {
      type: 'string' as const,
      description: 'Raw gathered data JSON (for save)',
    },
  },
  run: (ctx) => {
    try {
      const subcommand = ctx.positionals?.[1]

      const db = getDb()
      const repos = createRepositories(db)
      const reviewService = createReviewService({ repos })

      switch (subcommand) {
        case 'gather':
          return handleGather(ctx, reviewService)
        case 'list':
          return handleList(ctx, reviewService)
        case 'show':
          return handleShow(ctx, reviewService)
        case 'save':
          return handleSave(ctx, reviewService)
        case 'delete':
          return handleDelete(ctx, reviewService)
        default:
          errorOutput(
            'Usage: tt review <gather|list|show|save|delete> [flags]',
            'Run tt review gather --from monday --to today to get started',
          )
          process.exitCode = 1
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

function handleGather(
  ctx: { values: Record<string, unknown>; positionals?: string[] },
  reviewService: ReturnType<typeof createReviewService>,
): void {
  const fromDate = ctx.values.from
    ? parseDateFlag(ctx.values.from as string).startOf('day').toMillis()
    : DateTime.now().startOf('week').toMillis()
  const toDate = ctx.values.to
    ? parseDateFlag(ctx.values.to as string).endOf('day').toMillis()
    : DateTime.now().endOf('day').toMillis()

  const spread = ctx.values.spread
    ? parseInt(ctx.values.spread as string, 10)
    : undefined

  const result = reviewService.gather({
    from: fromDate,
    to: toDate,
    projectSlug: ctx.values.project as string | undefined,
    spread,
  })

  const jsonOutput = {
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    totalMs: result.totalMs,
    totalFormatted: formatDuration(result.totalMs),
    projectSlug: result.projectSlug ?? null,
    sessionCount: result.sessions.length,
    sessions: result.sessions.map(s => ({
      id: s.session.id,
      project: s.project.slug,
      startTime: s.session.startTime,
      endTime: s.session.endTime,
      durationMs: s.durationMs,
      durationFormatted: formatDuration(s.durationMs),
      notes: s.notes.map(n => n.content),
      tags: s.tags.map(t => t.tag),
    })),
    gitCommits: result.gitCommits.map(c => ({
      hash: c.hash,
      shortHash: c.shortHash,
      author: c.author,
      date: c.date,
      message: c.message,
      repositoryPath: c.repositoryPath,
      filesChanged: c.filesChanged ?? null,
      insertions: c.insertions ?? null,
      deletions: c.deletions ?? null,
    })),
    spread: result.spread
      ? {
          totalHours: result.spread.totalHours,
          spreadDays: result.spread.spreadDays,
          days: result.spread.days.map(d => ({
            date: d.date,
            dayOfWeek: d.dayOfWeek,
            hoursAllocated: d.hoursAllocated,
            commitCount: d.commits.length,
            commits: d.commits.map(c => ({
              shortHash: c.shortHash,
              message: c.message,
            })),
          })),
        }
      : null,
  }

  process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n')
}

function handleList(
  ctx: { values: Record<string, unknown> },
  reviewService: ReturnType<typeof createReviewService>,
): void {
  const limit = ctx.values.limit
    ? parseInt(ctx.values.limit as string, 10)
    : 20

  const reviews = reviewService.list({
    projectSlug: ctx.values.project as string | undefined,
    limit,
  })

  if (reviews.length === 0) {
    output('info', 'No reviews found.')
    return
  }

  const table = new Table({
    head: ['ID', 'Title', 'Audience', 'Period', 'Duration', 'Created'],
    style: { head: [], border: [] },
  })

  for (const review of reviews) {
    const periodStart = DateTime.fromMillis(review.periodStart).toFormat('dd LLL')
    const periodEnd = DateTime.fromMillis(review.periodEnd).toFormat('dd LLL')
    const created = DateTime.fromMillis(review.createdAt).toFormat('dd LLL HH:mm')

    table.push([
      review.id.slice(0, 8),
      review.title.length > 40 ? review.title.slice(0, 37) + '...' : review.title,
      review.audience,
      `${periodStart} - ${periodEnd}`,
      formatDuration(review.totalMs),
      created,
    ])
  }

  process.stdout.write(table.toString() + '\n')
}

function handleShow(
  ctx: { positionals?: string[] },
  reviewService: ReturnType<typeof createReviewService>,
): void {
  const reviewId = ctx.positionals?.[2]
  if (!reviewId) {
    errorOutput('Usage: tt review show <id>')
    process.exitCode = 1
    return
  }

  const result = reviewService.show(reviewId)
  if (!result) {
    errorOutput(`Review not found: ${reviewId}`)
    process.exitCode = 1
    return
  }

  const { review, sessionCount, commitCount } = result
  const periodStart = DateTime.fromMillis(review.periodStart).toFormat('dd LLL yyyy')
  const periodEnd = DateTime.fromMillis(review.periodEnd).toFormat('dd LLL yyyy')

  process.stdout.write(`Title: ${review.title}\n`)
  process.stdout.write(`Audience: ${review.audience}\n`)
  process.stdout.write(`Period: ${periodStart} - ${periodEnd}\n`)
  process.stdout.write(`Duration: ${formatDuration(review.totalMs)}\n`)
  process.stdout.write(`Sessions: ${sessionCount} | Commits: ${commitCount}\n`)
  if (review.spreadDays) {
    process.stdout.write(`Spread: ${review.spreadDays} days\n`)
  }
  process.stdout.write(`\n---\n\n`)
  process.stdout.write(review.content + '\n')
}

function handleSave(
  ctx: { values: Record<string, unknown> },
  reviewService: ReturnType<typeof createReviewService>,
): void {
  const title = ctx.values.title as string | undefined
  const audience = ctx.values.audience as string | undefined
  const content = ctx.values.content as string | undefined
  const periodStartStr = ctx.values['period-start'] as string | undefined
  const periodEndStr = ctx.values['period-end'] as string | undefined
  const totalMsStr = ctx.values['total-ms'] as string | undefined
  const rawDataStr = ctx.values['raw-data'] as string | undefined

  if (!title || !audience || !content || !periodStartStr || !periodEndStr || !totalMsStr) {
    errorOutput(
      'Usage: tt review save --title "..." --audience client --content "..." --period-start <ms> --period-end <ms> --total-ms <ms>',
    )
    process.exitCode = 1
    return
  }

  const periodStart = parseInt(periodStartStr, 10)
  const periodEnd = parseInt(periodEndStr, 10)
  const totalMs = parseInt(totalMsStr, 10)

  let rawData: ReturnType<typeof JSON.parse> | undefined
  if (rawDataStr) {
    try {
      rawData = JSON.parse(rawDataStr)
    } catch {
      errorOutput('Invalid JSON for --raw-data')
      process.exitCode = 1
      return
    }
  }

  const gathered = rawData ?? {
    sessions: [],
    gitCommits: [],
    periodStart,
    periodEnd,
    totalMs,
    projectSlug: ctx.values.project as string | undefined,
  }

  const spreadStr = ctx.values.spread as string | undefined
  const spreadDays = spreadStr ? parseInt(spreadStr, 10) : undefined

  const review = reviewService.save({
    title,
    audience,
    content,
    gathered,
    spreadDays,
  })

  output('info', `Review saved: ${review.id.slice(0, 8)}`)
  process.stdout.write(`Full ID: ${review.id}\n`)
}

function handleDelete(
  ctx: { positionals?: string[] },
  reviewService: ReturnType<typeof createReviewService>,
): void {
  const reviewId = ctx.positionals?.[2]
  if (!reviewId) {
    errorOutput('Usage: tt review delete <id>')
    process.exitCode = 1
    return
  }

  const deleted = reviewService.delete(reviewId)
  if (!deleted) {
    errorOutput(`Review not found: ${reviewId}`)
    process.exitCode = 1
    return
  }

  output('stopped', `Review deleted: ${reviewId.slice(0, 8)}`)
}

export default reviewCommand
