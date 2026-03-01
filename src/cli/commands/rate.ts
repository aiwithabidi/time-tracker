import { define } from 'gunshi'
import { loadConfig, saveConfig } from '../../config/config-loader'
import type { ProjectAlias } from '../../config/types'
import { getDb } from '../../db/client'
import { createRepositories } from '../../db/repositories/index'
import { output, errorOutput, formatCurrency } from '../format'
import { handleCommandError } from '../helpers'
import { compactTable } from '../table'

function findProjectEntryBySlug(
  projects: Record<string, ProjectAlias>,
  slug: string,
): [string, ProjectAlias] | undefined {
  return Object.entries(projects).find(([, proj]) => proj.slug === slug)
}

function handleSet(positionals: string[]): void {
  const slug = positionals[2]
  const rateStr = positionals[3]
  const currency = positionals[4]

  if (!slug || !rateStr) {
    errorOutput(
      'Usage: tt rate set <project-slug> <rate> [currency]',
      'Example: tt rate set my-project 150',
    )
    process.exitCode = 1
    return
  }

  const rate = Number(rateStr)
  if (!Number.isFinite(rate) || rate <= 0) {
    errorOutput('Rate must be a positive number', `Got: ${rateStr}`)
    process.exitCode = 1
    return
  }

  const config = loadConfig()
  const entry = findProjectEntryBySlug(config.projects, slug)

  if (entry) {
    const [dirPath, existing] = entry
    const updatedConfig = {
      ...config,
      projects: {
        ...config.projects,
        [dirPath]: {
          ...existing,
          hourlyRate: rate,
          ...(currency ? { currency } : {}),
        },
      },
    }
    saveConfig(updatedConfig)
    const displayCurrency = currency ?? existing.currency ?? config.defaults.currency
    output('info', `Rate set: ${slug} → ${formatCurrency(rate, displayCurrency)}/hr`)
    return
  }

  // Not in config — check DB for existing project
  const db = getDb()
  const repos = createRepositories(db)
  const dbProject = repos.projects.findBySlug(slug)

  if (dbProject) {
    const dirPath = dbProject.directoryPath ?? slug
    const resolvedCurrency = currency ?? config.defaults.currency
    const updatedConfig = {
      ...config,
      projects: {
        ...config.projects,
        [dirPath]: {
          slug,
          displayName: dbProject.displayName ?? slug,
          hourlyRate: rate,
          currency: resolvedCurrency,
        },
      },
    }
    saveConfig(updatedConfig)
    output('info', `Rate set: ${slug} → ${formatCurrency(rate, resolvedCurrency)}/hr`)
    return
  }

  errorOutput(
    `Project not found: ${slug}`,
    'Add it first with: tt alias add <directory> <slug>',
  )
  process.exitCode = 1
}

function handleShow(): void {
  const config = loadConfig()
  const entries = Object.entries(config.projects)

  if (entries.length === 0) {
    output('idle', 'No projects configured')
    return
  }

  const rows = entries.map(([, proj]) => [
    proj.slug,
    proj.hourlyRate !== undefined ? formatCurrency(proj.hourlyRate, proj.currency) : '-',
    proj.currency,
  ])

  const table = compactTable(['Slug', 'Rate', 'Currency'], rows)
  process.stdout.write(table + '\n')
}

const rateCommand = define({
  name: 'rate',
  description: 'Manage project hourly rates (usage: tt rate set|show)',
  args: {},
  run: (ctx) => {
    try {
      const subcommand = ctx.positionals?.[1]

      switch (subcommand) {
        case 'set':
          return handleSet(ctx.positionals ?? [])
        case 'show':
          return handleShow()
        default:
          errorOutput(
            'Usage: tt rate <set|show>',
            'Examples:\n  tt rate set my-project 150\n  tt rate set my-project 150 EUR\n  tt rate show',
          )
          process.exitCode = 1
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default rateCommand
