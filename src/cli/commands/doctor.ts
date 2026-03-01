import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { define } from 'gunshi'
import { VERSION } from '../version'
import { output, errorOutput } from '../format'

interface Check {
  readonly code: string
  readonly label: string
  readonly check: () => 'ok' | 'warn' | 'error'
  readonly repair?: () => boolean
}

function getHomeTtDir(): string {
  return path.join(os.homedir(), '.tt')
}

function readSettingsJson(): Record<string, unknown> | null {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return null
  }
}

function hookRegistered(
  settings: Record<string, unknown>,
  event: string,
  pattern: string,
): boolean {
  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown[]>
  const entries = (hooks[event] ?? []) as Array<Record<string, unknown>>
  return entries.some((entry) => {
    const entryHooks = (entry['hooks'] ?? []) as Array<Record<string, unknown>>
    return entryHooks.some((h) =>
      String(h['command'] ?? '').includes(pattern),
    )
  })
}

const doctorCommand = define({
  name: 'doctor',
  description: 'Check tt installation health and auto-repair issues',
  args: {
    repair: {
      type: 'boolean',
      short: 'r',
      description: 'Auto-repair fixable issues',
    },
  },
  run: (ctx) => {
    const ttDir = getHomeTtDir()
    const doRepair = ctx.values.repair ?? false
    const settings = readSettingsJson()

    let errors = 0
    let warnings = 0
    let repaired = 0

    const checks: ReadonlyArray<Check> = [
      // E001: ~/.tt directory exists
      {
        code: 'E001',
        label: '~/.tt directory',
        check: () => (fs.existsSync(ttDir) ? 'ok' : 'error'),
        repair: () => {
          fs.mkdirSync(ttDir, { recursive: true })
          fs.chmodSync(ttDir, 0o700)
          return true
        },
      },
      // E002: Required subdirectories
      ...(['bin', 'hooks', 'terminals', 'cache', 'logs'] as const).map(
        (dir) => ({
          code: `E002`,
          label: `~/.tt/${dir}/ directory`,
          check: () =>
            fs.existsSync(path.join(ttDir, dir)) ? 'ok' : ('error' as const),
          repair: () => {
            const dirPath = path.join(ttDir, dir)
            fs.mkdirSync(dirPath, { recursive: true })
            fs.chmodSync(dirPath, 0o700)
            return true
          },
        }),
      ),
      // E003: Binary exists
      {
        code: 'E003',
        label: '~/.tt/bin/tt binary',
        check: () => (fs.existsSync(path.join(ttDir, 'bin', 'tt')) ? 'ok' : 'error'),
      },
      // E004: VERSION file
      {
        code: 'E004',
        label: 'VERSION file',
        check: () => (fs.existsSync(path.join(ttDir, 'VERSION')) ? 'ok' : 'error'),
        repair: () => {
          fs.writeFileSync(path.join(ttDir, 'VERSION'), VERSION, 'utf-8')
          return true
        },
      },
      // W001: VERSION matches binary
      {
        code: 'W001',
        label: 'VERSION matches binary',
        check: () => {
          const versionFile = path.join(ttDir, 'VERSION')
          if (!fs.existsSync(versionFile)) return 'warn'
          const fileVersion = fs.readFileSync(versionFile, 'utf-8').trim()
          return fileVersion === VERSION ? 'ok' : 'warn'
        },
        repair: () => {
          fs.writeFileSync(path.join(ttDir, 'VERSION'), VERSION, 'utf-8')
          return true
        },
      },
      // E005: config.json parseable
      {
        code: 'E005',
        label: 'config.json',
        check: () => {
          const configPath = path.join(ttDir, 'config.json')
          if (!fs.existsSync(configPath)) return 'ok' // defaults are fine
          try {
            JSON.parse(fs.readFileSync(configPath, 'utf-8'))
            return 'ok'
          } catch {
            return 'error'
          }
        },
      },
      // W002: sourceRepo configured and exists
      {
        code: 'W002',
        label: 'sourceRepo configured',
        check: () => {
          const configPath = path.join(ttDir, 'config.json')
          if (!fs.existsSync(configPath)) return 'warn'
          try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
            if (!config.sourceRepo) return 'warn'
            return fs.existsSync(config.sourceRepo) ? 'ok' : 'warn'
          } catch {
            return 'warn'
          }
        },
      },
      // E006: Database accessible
      {
        code: 'E006',
        label: 'Database (tt.db)',
        check: () => (fs.existsSync(path.join(ttDir, 'tt.db')) ? 'ok' : 'error'),
      },
      // W003: Hook scripts exist
      ...(
        ['session-start.sh', 'post-tool-use.sh', 'stop.sh', 'check-update.js'] as const
      ).map((hook) => ({
        code: 'W003',
        label: `Hook: ${hook}`,
        check: () =>
          fs.existsSync(path.join(ttDir, 'hooks', hook))
            ? 'ok'
            : ('warn' as const),
      })),
      // W004: Hooks registered in settings.json
      {
        code: 'W004',
        label: 'SessionStart hook in settings.json',
        check: () => {
          if (!settings) return 'warn'
          return hookRegistered(settings, 'SessionStart', 'session-start.sh')
            ? 'ok'
            : 'warn'
        },
      },
      {
        code: 'W004',
        label: 'PostToolUse hook in settings.json',
        check: () => {
          if (!settings) return 'warn'
          return hookRegistered(settings, 'PostToolUse', 'post-tool-use.sh')
            ? 'ok'
            : 'warn'
        },
      },
      {
        code: 'W004',
        label: 'Stop hook in settings.json',
        check: () => {
          if (!settings) return 'warn'
          return hookRegistered(settings, 'Stop', 'stop.sh') ? 'ok' : 'warn'
        },
      },
      {
        code: 'W004',
        label: 'check-update hook in settings.json',
        check: () => {
          if (!settings) return 'warn'
          return hookRegistered(settings, 'SessionStart', 'check-update.js')
            ? 'ok'
            : 'warn'
        },
      },
    ]

    output('info', `tt doctor v${VERSION}\n`)

    for (const check of checks) {
      const result = check.check()

      if (result === 'ok') {
        process.stdout.write(`  \x1b[32m✓\x1b[0m ${check.label}\n`)
      } else if (result === 'warn') {
        warnings += 1
        if (doRepair && check.repair) {
          const fixed = check.repair()
          if (fixed) {
            repaired += 1
            process.stdout.write(
              `  \x1b[33m⚠\x1b[0m ${check.label} — \x1b[32mrepaired\x1b[0m\n`,
            )
          } else {
            process.stdout.write(
              `  \x1b[33m⚠\x1b[0m ${check.label} [${check.code}]\n`,
            )
          }
        } else {
          process.stdout.write(
            `  \x1b[33m⚠\x1b[0m ${check.label} [${check.code}]\n`,
          )
        }
      } else {
        errors += 1
        if (doRepair && check.repair) {
          const fixed = check.repair()
          if (fixed) {
            repaired += 1
            process.stdout.write(
              `  \x1b[31m✗\x1b[0m ${check.label} — \x1b[32mrepaired\x1b[0m\n`,
            )
          } else {
            process.stdout.write(
              `  \x1b[31m✗\x1b[0m ${check.label} [${check.code}]\n`,
            )
          }
        } else {
          process.stdout.write(
            `  \x1b[31m✗\x1b[0m ${check.label} [${check.code}]\n`,
          )
        }
      }
    }

    process.stdout.write('\n')

    if (repaired > 0) {
      output('started', `Repaired ${repaired} issue(s)`)
    }

    if (errors === 0 && warnings === 0) {
      output('started', 'All checks passed — tt is healthy')
    } else if (errors === 0) {
      output('idle', `${warnings} warning(s) found`)
      if (!doRepair) {
        output('idle', 'Run "tt doctor --repair" to auto-fix')
      }
    } else {
      output('error', `${errors} error(s), ${warnings} warning(s)`)
      if (!doRepair) {
        output('error', 'Run "tt doctor --repair" to auto-fix what\'s possible')
      } else {
        const remaining = errors + warnings - repaired
        if (remaining > 0) {
          output('error', `${remaining} issue(s) need manual attention`)
          output('idle', 'Try running "tt setup" from the source repo')
        }
      }
    }
  },
})

export default doctorCommand
