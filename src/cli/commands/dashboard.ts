import { define } from 'gunshi'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { spawn } from 'node:child_process'
import { loadConfig } from '../../config/config-loader'
import { output, errorOutput } from '../format'
import { handleCommandError } from '../helpers'

const dashboardCommand = define({
  name: 'dashboard',
  description: 'Open the time tracking dashboard in your browser',
  args: {
    port: {
      type: 'string',
      short: 'p',
      description: 'Port to run the dashboard on (default: 7777)',
    },
  },
  run: (ctx) => {
    try {
      const config = loadConfig()
      const sourceRepo = config.sourceRepo

      if (!sourceRepo) {
        errorOutput(
          'Dashboard requires sourceRepo to be set in config',
          'Run: tt config set sourceRepo /path/to/time-tracker',
        )
        process.exitCode = 1
        return
      }

      const dashboardDir = path.join(sourceRepo, 'packages', 'dashboard')
      const serverPath = path.join(dashboardDir, 'src', 'server', 'server.ts')

      if (!fs.existsSync(serverPath)) {
        errorOutput(
          `Dashboard not found at ${dashboardDir}`,
          'Make sure sourceRepo points to the tt source checkout',
        )
        process.exitCode = 1
        return
      }

      const rawPort = ctx.values.port ?? process.env['TT_DASHBOARD_PORT'] ?? '7777'
      const portNum = parseInt(rawPort, 10)
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        errorOutput(`Invalid port: "${rawPort}"`, 'Use a number between 1 and 65535')
        process.exitCode = 1
        return
      }
      const port = String(portNum)
      const url = `http://localhost:${port}`

      output('started', `Starting dashboard at ${url}`)

      // Start the Bun server
      const child = spawn('bun', ['run', serverPath], {
        cwd: dashboardDir,
        env: { ...process.env, TT_DASHBOARD_PORT: port },
        stdio: 'inherit',
      })

      setTimeout(() => {
        let openCmd: string
        if (process.platform === 'darwin') {
          openCmd = 'open'
        } else if (process.platform === 'win32') {
          openCmd = 'start'
        } else {
          openCmd = 'xdg-open'
        }
        spawn(openCmd, [url], { stdio: 'ignore', detached: true }).unref()
      }, 500)

      // Keep running until Ctrl+C
      process.on('SIGINT', () => {
        child.kill('SIGTERM')
        process.exit(0)
      })

      child.on('exit', (code) => {
        process.exit(code ?? 0)
      })
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default dashboardCommand
