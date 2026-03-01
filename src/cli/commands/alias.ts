import * as path from 'node:path'
import * as fs from 'node:fs'
import { define } from 'gunshi'
import { loadConfig, saveConfig } from '../../config/config-loader'
import type { ProjectAlias } from '../../config/types'
import { output, errorOutput } from '../format'
import { handleCommandError } from '../helpers'
import { compactTable } from '../table'

function handleAdd(positionals: string[]): void {
  const directory = positionals[2]
  const slug = positionals[3]

  if (!directory || !slug) {
    errorOutput(
      'Usage: tt alias add <directory> <slug>',
      'Example: tt alias add /path/to/project my-project',
    )
    process.exitCode = 1
    return
  }

  const absolutePath = path.resolve(directory)

  if (!fs.existsSync(absolutePath)) {
    process.stderr.write(
      `Warning: directory does not exist yet: ${absolutePath}\n`,
    )
  }

  const config = loadConfig()
  const alias: ProjectAlias = {
    slug,
    displayName: slug,
    currency: config.defaults.currency,
  }

  const updatedConfig = {
    ...config,
    projects: {
      ...config.projects,
      [absolutePath]: alias,
    },
  }

  saveConfig(updatedConfig)
  output('info', `Alias added: ${absolutePath} → ${slug}`)
}

function handleList(): void {
  const config = loadConfig()
  const entries = Object.entries(config.projects)

  if (entries.length === 0) {
    output('idle', 'No aliases configured')
    return
  }

  const rows = entries.map(([dir, proj]) => [
    dir,
    proj.slug,
    proj.hourlyRate !== undefined ? `${proj.hourlyRate} ${proj.currency}` : '-',
  ])

  const table = compactTable(['Directory', 'Slug', 'Rate'], rows)
  process.stdout.write(table + '\n')
}

function handleRemove(positionals: string[]): void {
  const directory = positionals[2]

  if (!directory) {
    errorOutput(
      'Usage: tt alias remove <directory>',
      'Example: tt alias remove /path/to/project',
    )
    process.exitCode = 1
    return
  }

  const absolutePath = path.resolve(directory)
  const config = loadConfig()

  if (!(absolutePath in config.projects)) {
    errorOutput(`No alias found for: ${absolutePath}`)
    process.exitCode = 1
    return
  }

  const { [absolutePath]: _removed, ...remainingProjects } = config.projects
  const updatedConfig = {
    ...config,
    projects: remainingProjects,
  }

  saveConfig(updatedConfig)
  output('info', `Alias removed: ${absolutePath}`)
}

const aliasCommand = define({
  name: 'alias',
  description: 'Manage project directory aliases (usage: tt alias add|list|remove)',
  args: {},
  run: (ctx) => {
    try {
      const subcommand = ctx.positionals?.[1]

      switch (subcommand) {
        case 'add':
          return handleAdd(ctx.positionals ?? [])
        case 'list':
          return handleList()
        case 'remove':
          return handleRemove(ctx.positionals ?? [])
        default:
          errorOutput(
            'Usage: tt alias <add|list|remove>',
            'Examples:\n  tt alias add /path/to/dir my-project\n  tt alias list\n  tt alias remove /path/to/dir',
          )
          process.exitCode = 1
      }
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default aliasCommand
