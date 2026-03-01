import * as path from 'node:path'
import { loadConfig } from '../config/config-loader'
import type { Project } from '../db/types'

export interface ResolvedProject {
  slug: string
  displayName: string
  directoryPath: string
  source: 'git' | 'alias' | 'dir' | 'prompt'
  clientName?: string
  hourlyRate?: number
  currency: string
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function findAlias(cwd: string): ResolvedProject | undefined {
  const config = loadConfig()
  const projects = config.projects

  let dir = cwd
  while (true) {
    const alias = projects[dir]
    if (alias) {
      return {
        slug: alias.slug,
        displayName: alias.displayName,
        directoryPath: dir,
        source: 'alias',
        clientName: alias.clientName,
        hourlyRate: alias.hourlyRate,
        currency: alias.currency,
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }

  return undefined
}

const gitRootCache = new Map<string, string>()

function detectGitRoot(cwd: string): ResolvedProject | undefined {
  try {
    const cached = gitRootCache.get(cwd)
    let gitRoot: string

    if (cached !== undefined) {
      gitRoot = cached
    } else {
      const result = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      if (result.exitCode !== 0) {
        return undefined
      }

      gitRoot = result.stdout.toString().trim()
      if (!gitRoot) {
        return undefined
      }

      gitRootCache.set(cwd, gitRoot)
    }

    const basename = path.basename(gitRoot)
    const slug = slugify(basename)

    return {
      slug,
      displayName: basename,
      directoryPath: gitRoot,
      source: 'git',
      currency: 'USD',
    }
  } catch {
    return undefined
  }
}

export function resolveProject(cwd: string): ResolvedProject {
  const fromAlias = findAlias(cwd)
  if (fromAlias) {
    return fromAlias
  }

  const fromGit = detectGitRoot(cwd)
  if (fromGit) {
    return fromGit
  }

  throw new Error(
    'Could not detect project. Run from a git repo or configure an alias with: tt alias add'
  )
}

interface ProjectRepository {
  findBySlug(slug: string): Project | undefined
  upsertFromDirectory(slug: string, dirPath: string, displayName: string): Project
}

export function ensureProjectInDb(
  resolved: ResolvedProject,
  projectRepo: ProjectRepository
): Project {
  const existing = projectRepo.findBySlug(resolved.slug)
  if (existing) {
    return existing
  }

  return projectRepo.upsertFromDirectory(
    resolved.slug,
    resolved.directoryPath,
    resolved.displayName
  )
}
