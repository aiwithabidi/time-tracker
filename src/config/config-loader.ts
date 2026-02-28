import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { configSchema, type Config, type ProjectAlias } from './types'

const CONFIG_DIR = path.join(os.homedir(), '.tt')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

function defaultConfig(): Config {
  return configSchema.parse({})
}

export function loadConfig(): Config {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return defaultConfig()
    }

    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    const result = configSchema.safeParse(parsed)

    if (!result.success) {
      process.stderr.write(
        `Warning: config.json has invalid format, using defaults\n`
      )
      return defaultConfig()
    }

    return result.data
  } catch {
    process.stderr.write(
      `Warning: could not read config.json, using defaults\n`
    )
    return defaultConfig()
  }
}

export function saveConfig(config: Config): void {
  ensureConfigDir()
  const json = JSON.stringify(config, null, 2)
  fs.writeFileSync(CONFIG_PATH, json, 'utf-8')
}

export function addAlias(dirPath: string, alias: ProjectAlias): Config {
  const config = loadConfig()
  const updatedConfig: Config = {
    ...config,
    projects: {
      ...config.projects,
      [dirPath]: alias,
    },
  }
  saveConfig(updatedConfig)
  return updatedConfig
}
