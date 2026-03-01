import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { define } from 'gunshi'
import { output, errorOutput } from '../format'
import { handleCommandError } from '../helpers'

function getConfigPath(): string {
  return path.join(os.homedir(), '.tt', 'config.json')
}

function readRawConfig(): Record<string, unknown> {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) return {}
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

function writeRawConfig(config: Record<string, unknown>): void {
  const configPath = getConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

function getNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
): unknown {
  const keys = keyPath.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function setNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown,
): Record<string, unknown> {
  const keys = keyPath.split('.')
  if (keys.length === 1) {
    return { ...obj, [keys[0]!]: value }
  }

  const [first, ...rest] = keys
  const child =
    typeof obj[first!] === 'object' && obj[first!] !== null
      ? (obj[first!] as Record<string, unknown>)
      : {}

  return {
    ...obj,
    [first!]: setNestedValue(child, rest.join('.'), value),
  }
}

function coerceValue(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  const num = Number(raw)
  if (!isNaN(num) && raw.trim() !== '') return num
  return raw
}

function formatValue(value: unknown, indent = 0): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
      .split('\n')
      .map((line, i) => (i === 0 ? line : ' '.repeat(indent) + line))
      .join('\n')
  }
  return String(value)
}

const configCommand = define({
  name: 'config',
  description: 'Manage tt configuration (usage: tt config list|get|set)',
  args: {},
  run: (ctx) => {
    try {
      // positionals[0] = "config", positionals[1] = subcommand
      const subcommand = ctx.positionals?.[1]

      if (!subcommand || subcommand === 'list') {
        const config = readRawConfig()
        if (Object.keys(config).length === 0) {
          output('idle', 'No configuration set (using defaults)')
          return
        }
        process.stdout.write(JSON.stringify(config, null, 2) + '\n')
        return
      }

      if (subcommand === 'get') {
        const key = ctx.positionals?.[2]
        if (!key) {
          errorOutput('Key required', 'Usage: tt config get <key>')
          process.exitCode = 1
          return
        }
        const config = readRawConfig()
        const value = getNestedValue(config, key)
        if (value === undefined) {
          errorOutput(`Key "${key}" not found`)
          process.exitCode = 1
          return
        }
        process.stdout.write(formatValue(value) + '\n')
        return
      }

      if (subcommand === 'set') {
        const key = ctx.positionals?.[2]
        const rawValue = ctx.positionals?.[3]
        if (!key || rawValue === undefined) {
          errorOutput('Key and value required', 'Usage: tt config set <key> <value>')
          process.exitCode = 1
          return
        }
        const config = readRawConfig()
        const value = coerceValue(rawValue)
        const updated = setNestedValue(config, key, value)
        writeRawConfig(updated)
        output('info', `${key} = ${formatValue(value)}`)
        return
      }

      errorOutput(
        `Unknown subcommand: ${subcommand}`,
        'Usage: tt config list|get|set',
      )
      process.exitCode = 1
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default configCommand
