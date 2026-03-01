import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execSync } from 'node:child_process'
import { define } from 'gunshi'
import { VERSION } from '../version'
import { output, errorOutput } from '../format'
import { handleCommandError } from '../helpers'
import { loadConfig } from '../../config/config-loader'

function getSourceRepo(): string {
  const config = loadConfig()
  if (config.sourceRepo) {
    return config.sourceRepo
  }
  throw new Error(
    'No sourceRepo configured. Run "tt setup" from the source repository first.',
  )
}

const TIMEOUT_GIT = 30_000
const TIMEOUT_INSTALL = 120_000
const TIMEOUT_BUILD = 120_000

const EXPECTED_REPO_PATTERNS = [
  /github\.com[:/]aiwithabidi\/time-tracker(\.git)?$/,
]

function exec(cmd: string, cwd: string, timeout = TIMEOUT_GIT): string {
  return execSync(cmd, { encoding: 'utf8', cwd, timeout }).trim()
}

function verifyRemoteOrigin(repoDir: string): void {
  const remoteUrl = exec('git remote get-url origin', repoDir)
  const isTrusted = EXPECTED_REPO_PATTERNS.some((pattern) =>
    pattern.test(remoteUrl),
  )
  if (!isTrusted) {
    throw new Error(
      `Untrusted remote origin: ${remoteUrl}\nExpected a github.com/aiwithabidi/time-tracker remote.`,
    )
  }
}

function getLocalHead(repoDir: string): string {
  return exec('git rev-parse HEAD', repoDir)
}

function getRemoteHead(repoDir: string): string {
  exec('git fetch origin main --quiet', repoDir)
  return exec('git rev-parse origin/main', repoDir)
}

function getChangelogDiff(repoDir: string, localHead: string): string {
  const changelogPath = path.join(repoDir, 'CHANGELOG.md')
  if (!fs.existsSync(changelogPath)) {
    return ''
  }
  try {
    return exec(`git diff ${localHead}..origin/main -- CHANGELOG.md`, repoDir)
  } catch {
    return ''
  }
}

function formatChangelogDiff(diff: string): string {
  if (!diff) {
    return '  No changelog entries found'
  }

  // Extract only added lines (skip diff headers)
  const lines = diff.split('\n')
  const added = lines
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .filter((line) => line.trim().length > 0)

  if (added.length === 0) {
    return '  No new changelog entries'
  }

  return added.map((line) => `  ${line}`).join('\n')
}

const updateCommand = define({
  name: 'update',
  description: 'Update tt to the latest version from source',
  args: {
    check: {
      type: 'boolean',
      description: 'Only check for updates, do not install',
    },
    yes: {
      type: 'boolean',
      short: 'y',
      description: 'Skip confirmation prompt',
    },
  },
  run: async (ctx) => {
    try {
      const repoDir = getSourceRepo()

      if (!fs.existsSync(repoDir)) {
        errorOutput(
          `Source repo not found at: ${repoDir}`,
          'Run "tt setup" from the source repo to configure the path',
        )
        process.exitCode = 1
        return
      }

      output('info', `Checking for updates (source: ${repoDir})`)

      const localHead = getLocalHead(repoDir)
      const remoteHead = getRemoteHead(repoDir)

      if (localHead === remoteHead) {
        output('info', `Already up to date (v${VERSION})`)
        clearUpdateCache()
        return
      }

      // Show what's new
      const changelogDiff = getChangelogDiff(repoDir, localHead)
      const shortLocal = localHead.slice(0, 8)
      const shortRemote = remoteHead.slice(0, 8)

      output('info', `Update available: ${shortLocal} → ${shortRemote}`)
      process.stdout.write('\nWhat\'s new:\n')
      process.stdout.write(formatChangelogDiff(changelogDiff))
      process.stdout.write('\n\n')

      if (ctx.values.check) {
        output('info', 'Run "tt update" to install')
        return
      }

      // Confirm unless --yes
      if (!ctx.values.yes) {
        const { confirm } = await import('@inquirer/prompts')
        const proceed = await confirm({
          message: 'Install update?',
          default: true,
        })
        if (!proceed) {
          output('info', 'Update cancelled')
          return
        }
      }

      // Verify remote URL before pulling code
      verifyRemoteOrigin(repoDir)

      // Save head for rollback
      const savedHead = localHead

      try {
        // Pull
        output('info', 'Pulling latest changes...')
        exec('git pull origin main', repoDir, TIMEOUT_GIT)

        // Install deps
        output('info', 'Installing dependencies...')
        exec('bun install', repoDir, TIMEOUT_INSTALL)

        // Build
        output('info', 'Building...')
        exec('bun run build', repoDir, TIMEOUT_BUILD)
      } catch (buildError) {
        // Rollback on failure
        output('info', 'Build failed, rolling back...')
        try {
          exec(`git reset --hard ${savedHead}`, repoDir)
        } catch {
          // Rollback itself failed — leave repo in current state
        }
        clearUpdateCache()
        throw buildError
      }

      // Atomic binary replacement
      const builtBinary = path.join(repoDir, 'dist', 'tt')
      const installTarget = path.join(os.homedir(), '.tt', 'bin', 'tt')
      const tmpTarget = `${installTarget}.tmp`

      if (fs.existsSync(builtBinary)) {
        fs.copyFileSync(builtBinary, tmpTarget)
        fs.chmodSync(tmpTarget, 0o755)
        fs.renameSync(tmpTarget, installTarget)
        output('started', 'Binary installed')
      } else {
        errorOutput('Built binary not found at dist/tt')
        process.exitCode = 1
        return
      }

      // Write VERSION file
      const versionFile = path.join(os.homedir(), '.tt', 'VERSION')
      const newVersionPath = path.join(repoDir, 'src', 'cli', 'version.ts')
      let newVersion = VERSION
      if (fs.existsSync(newVersionPath)) {
        const content = fs.readFileSync(newVersionPath, 'utf-8')
        const match = content.match(/VERSION\s*=\s*'([^']+)'/)
        if (match) {
          newVersion = match[1]!
        }
      }
      fs.writeFileSync(versionFile, newVersion, 'utf-8')

      // Clear update cache
      clearUpdateCache()

      // Re-install skills (they may have changed)
      output('info', 'Re-installing skills...')
      try {
        const skillsDir = path.join(repoDir, 'skills')
        if (fs.existsSync(skillsDir)) {
          const targetSkillsDir = path.join(os.homedir(), '.claude', 'skills')
          const skillDirs = fs.readdirSync(skillsDir).filter((d) =>
            fs.statSync(path.join(skillsDir, d)).isDirectory(),
          )
          for (const dir of skillDirs) {
            const src = path.join(skillsDir, dir, 'SKILL.md')
            if (fs.existsSync(src)) {
              const dest = path.join(targetSkillsDir, dir)
              fs.mkdirSync(dest, { recursive: true })
              fs.copyFileSync(src, path.join(dest, 'SKILL.md'))
            }
          }
        }
      } catch {
        // Non-critical: skills install failure shouldn't block update
      }

      output('started', `Updated to v${newVersion}`)
      output('info', 'Restart Claude Code to use the new version')
    } catch (error) {
      handleCommandError(error)
    }
  },
})

function clearUpdateCache(): void {
  const cacheFile = path.join(
    os.homedir(),
    '.tt',
    'cache',
    'update-check.json',
  )
  try {
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile)
    }
  } catch {
    // Silent fail
  }
}

export default updateCommand
