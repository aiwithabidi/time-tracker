import type { GitCommitInfo } from './types'

const FIELD_SEPARATOR = '%x00'
const LOG_FORMAT = `%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%at${FIELD_SEPARATOR}%s`

export function readGitLog(options: {
  readonly repositoryPath: string
  readonly afterEpochSec: number
  readonly beforeEpochSec: number
  readonly includeStats?: boolean
}): readonly GitCommitInfo[] {
  const { repositoryPath, afterEpochSec, beforeEpochSec } = options

  const result = Bun.spawnSync(
    [
      'git', 'log',
      `--format=${LOG_FORMAT}`,
      `--after=${afterEpochSec}`,
      `--before=${beforeEpochSec}`,
    ],
    {
      cwd: repositoryPath,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  if (result.exitCode !== 0) {
    return []
  }

  const output = result.stdout.toString().trim()
  if (!output) {
    return []
  }

  const lines = output.split('\n')
  const commits: GitCommitInfo[] = []

  for (const line of lines) {
    const parts = line.split('\0')
    if (parts.length < 5) continue

    const [hash, shortHash, author, timestampStr, message] = parts as [string, string, string, string, string]
    const date = parseInt(timestampStr, 10) * 1000

    const commit: GitCommitInfo = {
      hash,
      shortHash,
      author,
      date,
      message,
      repositoryPath,
    }

    if (options.includeStats) {
      const stats = readCommitStats(repositoryPath, hash)
      if (stats) {
        commits.push({ ...commit, ...stats })
        continue
      }
    }

    commits.push(commit)
  }

  return commits
}

function readCommitStats(
  repositoryPath: string,
  hash: string,
): { filesChanged: number; insertions: number; deletions: number } | undefined {
  const result = Bun.spawnSync(
    ['git', 'show', '--stat', '--format=', hash],
    {
      cwd: repositoryPath,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  if (result.exitCode !== 0) {
    return undefined
  }

  const output = result.stdout.toString().trim()
  const lastLine = output.split('\n').pop()
  if (!lastLine) return undefined

  const filesMatch = lastLine.match(/(\d+) files? changed/)
  const insertionsMatch = lastLine.match(/(\d+) insertions?/)
  const deletionsMatch = lastLine.match(/(\d+) deletions?/)

  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1]!, 10) : 0,
    insertions: insertionsMatch ? parseInt(insertionsMatch[1]!, 10) : 0,
    deletions: deletionsMatch ? parseInt(deletionsMatch[1]!, 10) : 0,
  }
}
