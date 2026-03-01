import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import * as schema from '../../../../src/db/schema'
import { createRepositories } from '../../../../src/db/repositories/index'
import { createReportService } from '../../../../src/core/reports/report-service'
import { createStreakService } from '../../../../src/core/reports/streak-service'
import { loadConfig } from '../../../../src/config/config-loader'
import { computeSessionDuration } from '../../../../src/core/shared/duration'
import { DateTime } from 'luxon'
import { handleToday } from './routes/today'
import { handleWeek } from './routes/week'
import { handleSessions } from './routes/sessions'
import { handleProjects } from './routes/projects'
import { handleStreak } from './routes/streak'
import { handleHeatmap } from './routes/heatmap'
import { handleNow } from './routes/now'

const DB_PATH = path.join(os.homedir(), '.tt', 'tt.db')

function openReadOnlyDb() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`tt database not found at ${DB_PATH}. Run "tt start" first.`)
  }
  const sqlite = new Database(DB_PATH, { readonly: true })
  sqlite.exec('PRAGMA busy_timeout = 3000')
  sqlite.exec('PRAGMA journal_mode = WAL')
  return drizzle(sqlite, { schema })
}

function createServices() {
  const db = openReadOnlyDb()
  const repos = createRepositories(db)
  const reportService = createReportService({ repos })
  const streakService = createStreakService({ repos })
  const config = loadConfig()
  return { repos, reportService, streakService, config }
}

const port = Number(process.env['TT_DASHBOARD_PORT']) || 7777
const distDir = path.resolve(import.meta.dir, '../../dist')

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: corsHeaders(),
  })
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders(),
  })
}

const server = Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    // API routes — create fresh services per request to pick up new data
    if (url.pathname.startsWith('/api/')) {
      try {
        const services = createServices()
        const { reportService, streakService, config, repos } = services

        switch (url.pathname) {
          case '/api/now':
            return jsonResponse(handleNow(repos, config))
          case '/api/today':
            return jsonResponse(handleToday(reportService))
          case '/api/week':
            return jsonResponse(handleWeek(reportService, url.searchParams))
          case '/api/sessions':
            return jsonResponse(handleSessions(reportService, url.searchParams))
          case '/api/projects':
            return jsonResponse(handleProjects(reportService))
          case '/api/streak':
            return jsonResponse(handleStreak(streakService, config))
          case '/api/heatmap':
            return jsonResponse(handleHeatmap(streakService, url.searchParams))
          default:
            return errorResponse('Not found', 404)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error'
        return errorResponse(message, 500)
      }
    }

    // Static file serving (built SPA)
    const filePath = url.pathname === '/' ? '/index.html' : url.pathname
    const fullPath = path.join(distDir, filePath)

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return new Response(Bun.file(fullPath))
    }

    // SPA fallback
    const indexPath = path.join(distDir, 'index.html')
    if (fs.existsSync(indexPath)) {
      return new Response(Bun.file(indexPath))
    }

    return errorResponse('Dashboard not built. Run: bun run build in packages/dashboard/', 404)
  },
})

process.stdout.write(`\n  tt dashboard running at http://localhost:${server.port}\n\n`)
