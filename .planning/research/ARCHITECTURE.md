# Architecture: Web Dashboard Integration

**Domain:** Adding local web dashboard to existing CLI time tracker
**Researched:** 2026-02-28
**Confidence:** HIGH (Bun.serve, WebSocket, and static embedding verified against official docs)

## Executive Decision

The dashboard runs **in the same process** as the `tt dashboard` CLI command, sharing the SQLite database connection. No separate daemon, no IPC, no auth. The server uses `Bun.serve()` with the `routes` API for HTTP endpoints, WebSocket for real-time updates, and static HTML/CSS/JS assets served via `Bun.file()`.

## System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    Compiled Binary: dist/tt                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐   ┌──────────────────────────────────────────┐  │
│  │  CLI Commands │   │  tt dashboard (new command)              │  │
│  │  (gunshi)     │   │                                          │  │
│  │              │   │  ┌────────────────────────────────────┐  │  │
│  │  start       │   │  │         Bun.serve()                │  │  │
│  │  stop        │   │  │                                    │  │  │
│  │  now         │   │  │  routes: {                         │  │  │
│  │  today       │   │  │    "/":        index.html          │  │  │
│  │  week        │   │  │    "/api/...": API handlers        │  │  │
│  │  ...         │   │  │  }                                 │  │  │
│  │              │   │  │                                    │  │  │
│  └──────┬───────┘   │  │  fetch: WebSocket upgrade handler  │  │  │
│         │           │  │                                    │  │  │
│         │           │  │  websocket: {                      │  │  │
│         │           │  │    open, message, close             │  │  │
│         │           │  │  }                                 │  │  │
│         │           │  └──────────────┬─────────────────────┘  │  │
│         │           │                 │                         │  │
│         │           └─────────────────┼─────────────────────────┘  │
│         │                             │                            │
│         ▼                             ▼                            │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Service Layer (shared)                    │  │
│  │                                                             │  │
│  │  createSessionService({ repos })                            │  │
│  │  createReportService({ repos })                             │  │
│  │  createReviewService({ repos })                             │  │
│  │  createDashboardService({ repos })  <-- NEW (timeline,     │  │
│  │                                         earnings queries)   │  │
│  └──────────────────────┬──────────────────────────────────────┘  │
│                         │                                         │
│  ┌──────────────────────▼──────────────────────────────────────┐  │
│  │                  Repository Layer (shared)                   │  │
│  │  createRepositories(db) -> projects, sessions, pulses, ...  │  │
│  └──────────────────────┬──────────────────────────────────────┘  │
│                         │                                         │
│  ┌──────────────────────▼──────────────────────────────────────┐  │
│  │                     SQLite (bun:sqlite)                      │  │
│  │              ~/.tt/tt.db  WAL mode, shared connection        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. Same-Process Server (not a daemon)

**Decision:** The `tt dashboard` command starts Bun.serve() in the current process and keeps it alive until Ctrl+C.

**Why:**
- SQLite with WAL mode supports concurrent readers but only one writer. Same-process avoids write contention entirely.
- The existing `getDb()` singleton returns a cached connection. The server reuses it directly -- zero overhead.
- No daemon management (pidfiles, startup scripts, launchd). The developer runs `tt dashboard`, it opens a browser tab, and Ctrl+C stops it.
- The CLI commands (from other terminals) write to the same database file. WAL mode means the server can read while CLI writes. No coordination needed.

**Implication:** While the dashboard is running, the process blocks. This is fine -- it is a foreground command like `tt dashboard`, not a background service.

**Concurrency model:**
```
Terminal 1: tt dashboard     (server process, reads DB)
Terminal 2: tt pulse ...     (hook fire, writes DB)
Terminal 3: tt start acme    (CLI command, writes DB)
Terminal 4: tt stop          (CLI command, writes DB)

All write to the same ~/.tt/tt.db via WAL mode.
Dashboard server reads on 1-second poll interval.
SQLite WAL handles reader/writer concurrency natively.
```

### 2. Bun.serve() with Routes + WebSocket + Fetch Fallback

**Decision:** Use `Bun.serve()` with the `routes` object for static assets and API endpoints, `websocket` handlers for real-time updates, and a `fetch` fallback for WebSocket upgrade.

**Pattern:**
```typescript
const server = Bun.serve({
  port: 7117,

  // Static assets and API routes
  routes: {
    "/": Bun.file("./src/dashboard/public/index.html"),
    "/style.css": Bun.file("./src/dashboard/public/style.css"),
    "/app.js": Bun.file("./src/dashboard/public/app.js"),
    "/charts.js": Bun.file("./src/dashboard/public/charts.js"),
    "/api/status": handleStatus,       // GET current status + timer
    "/api/today": handleToday,         // GET today summary
    "/api/week": handleWeek,           // GET week summary
    "/api/sessions": handleSessions,   // GET session log
    "/api/projects": handleProjects,   // GET all projects
    "/api/earnings": handleEarnings,   // GET earnings data
    "/api/timeline": handleTimeline,   // GET day timeline
    "/api/actions/start": handleStart, // POST start session
    "/api/actions/stop": handleStop,   // POST stop session
  },

  // Fallback: WebSocket upgrade
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return
      return new Response("WebSocket upgrade failed", { status: 400 })
    }
    return new Response("Not found", { status: 404 })
  },

  // @ts-ignore -- Bun types don't yet allow routes + websocket together
  websocket: {
    open(ws) { clients.add(ws) },
    close(ws) { clients.delete(ws) },
    message(ws, msg) { /* handle incoming commands */ },
  },
})
```

**Note:** As of Bun 1.2+, the TypeScript types incorrectly disallow `routes` and `websocket` together ([oven-sh/bun#17871](https://github.com/oven-sh/bun/issues/17871), [#18314](https://github.com/oven-sh/bun/issues/18314)). The runtime supports it fine. Use `// @ts-ignore` on the websocket property until types are fixed.

### 3. Static File Serving

**Decision:** Serve frontend assets from the filesystem using `Bun.file()` in the routes map. For the compiled binary, embed files using `with { type: "file" }` imports.

**Development mode (bun run src/cli/index.ts):**
```typescript
routes: {
  "/": Bun.file("./src/dashboard/public/index.html"),
  "/style.css": Bun.file("./src/dashboard/public/style.css"),
  // ...
}
```

**Compiled binary (bun build --compile):**
```typescript
import indexHtml from "./public/index.html" with { type: "file" }
import styleCss from "./public/style.css" with { type: "file" }

routes: {
  "/": new Response(Bun.file(indexHtml), { headers: { "Content-Type": "text/html" } }),
  "/style.css": new Response(Bun.file(styleCss), { headers: { "Content-Type": "text/css" } }),
}
```

The `with { type: "file" }` import attribute embeds the file in the compiled binary and returns a path string (e.g. `$bunfs/index-a1b2c3.html`). `Bun.file()` can read from this embedded path.

**Alternative approach -- HTML import:** Bun also supports `import index from "./index.html"` which creates a manifest object that `Bun.serve()` serves automatically with all bundled assets. This is cleaner if it works reliably with `--compile`. Test during implementation; fall back to explicit file imports if needed.

**Risk:** MEDIUM. Bun's HTML import + `--compile` interaction needs validation. The `with { type: "file" }` approach is the safer fallback.

### 4. Frontend: Vanilla JS with Chart.js

**Decision:** Plain JavaScript with template literals for rendering, Chart.js for charts, and CSS custom properties for theming. No framework, no build step for frontend code.

**Why:**
- The dashboard has 4-5 views with server-driven data. No complex client-side state.
- Modern browser APIs (fetch, WebSocket, template literals, CSS custom properties) cover all needs.
- Chart.js (tree-shaken to bar + doughnut: ~50KB) handles the charting needs.
- The session timeline (horizontal bar) is implemented as CSS-positioned `<div>` elements, not a chart.
- Zero frontend build configuration. Files served as-is.

**Component pattern (no framework):**
```javascript
// Each view is a JS module that renders into a container div
export function renderTodayView(container, data) {
  container.innerHTML = `
    <div class="view-today">
      <div class="stat-cards">
        ${data.projects.map(p => `
          <div class="card">
            <h3>${p.project.displayName}</h3>
            <span class="duration">${formatDuration(p.totalMs)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `
}
```

### 5. WebSocket for Real-Time Updates (Push Model)

**Decision:** Server pushes state changes to all connected WebSocket clients. No polling from the browser.

**Data flow:**
```
CLI (any terminal)                Dashboard Server              Browser
     |                                 |                          |
     |  tt pulse (writes to DB)        |                          |
     |                                 |                          |
     |           +---------+           |                          |
     |           | Poll    |           |                          |
     |           | timer   |           |                          |
     |           | (1s)    |           |                          |
     |           +---------+           |                          |
     |                                 |                          |
     |                                 |---- ws.send(status) --->|
     |                                 |                          |
     |  tt stop (writes to DB)         |                          |
     |                                 |                          |
     |                                 |---- ws.send(stopped) -->|
     |                                 |                          |
```

**Server-side poll mechanism:**

The server checks for state changes every 1 second via `setInterval`. It compares the current state with the previously broadcast state and only sends a message when something changed.

```typescript
// Pseudocode for the poll loop
let lastState: string | null = null

setInterval(() => {
  const currentStatus = reportService.today()
  const activeSession = sessionService.now()
  const stateKey = JSON.stringify({ activeSession, todayTotal: currentStatus.grandTotalMs })

  if (stateKey !== lastState) {
    lastState = stateKey
    broadcast({ type: "status", data: { activeSession, today: currentStatus } })
  }
}, 1000)
```

**Why a poll timer instead of file watching:**
- SQLite WAL does not emit filesystem events on every write in a way that is reliably detectable.
- A 1-second `setInterval` checking for session state changes is trivial CPU cost.
- The poll reads from the same in-process DB connection -- sub-millisecond.
- Avoids complexity of `fs.watch` on WAL files, which is platform-dependent and unreliable.

**Client-side timer smoothing:**

Between server pushes, the browser runs its own `setInterval` (1s) to increment the displayed timer. This prevents the timer from appearing to "jump" on each server update. When a server message arrives, the client resets its local timer to the authoritative server value.

**WebSocket message protocol:**
```typescript
// Server -> Client
type ServerMessage =
  | { type: "status"; data: { active: ActiveSession | null; today: TodaySummary } }
  | { type: "action_result"; data: { success: boolean; error?: string } }

// Client -> Server (for quick actions)
type ClientMessage =
  | { type: "start"; project: string }
  | { type: "stop" }
```

### 6. API Layer: Thin Wrappers Around Existing Services

**Decision:** API route handlers are thin functions that call existing services and return JSON. No new framework.

**Why:**
- The services already exist: `createReportService()`, `createSessionService()`.
- `Bun.serve()` natively returns `Response` objects. No framework needed for ~10 endpoints.
- Adding Hono or Elysia would add dependencies for zero benefit on a local-only, auth-free API.

**Handler pattern:**
```typescript
// src/dashboard/api/status.ts
import { createReportService, createSessionService } from '../../cli/helpers'

export function handleStatus(): Response {
  const reportService = createReportService()
  const sessionService = createSessionService()

  const today = reportService.today()
  const active = sessionService.now()

  return Response.json({
    success: true,
    data: { active, today },
  })
}
```

**Important:** Handlers call the same factory functions (`createReportService()`, `createSessionService()`) that CLI commands use. These functions internally call `getDb()` which returns the singleton DB connection. No new wiring needed.

**Response format follows the existing project pattern:**
```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

### 7. Dashboard-Specific Service

**Decision:** Create a new `createDashboardService({ repos })` for queries that the CLI does not need but the dashboard does: timeline data, earnings breakdowns, and weekly comparison.

**What goes here (new queries):**
- `timeline(date)` -- Returns sessions for a specific day as segments with project, start, end, and color. Used to render the horizontal timeline bar.
- `earnings(period)` -- Returns billable totals per project with rate * hours calculation. The CLI has this in the week command output, but the dashboard needs it in a different shape (per-project breakdown with running totals).
- `weekComparison()` -- This week vs last week totals for comparison display.

**What does NOT go here:**
- `today()`, `week()`, `log()`, `allProjects()` -- these already exist in `createReportService()`.
- `start()`, `stop()`, `now()` -- these already exist in `createSessionService()`.

## Component Boundaries

### New Components

| Component | Location | Responsibility | LOC Estimate |
|-----------|----------|---------------|--------------|
| Dashboard command | `src/cli/commands/dashboard.ts` | Parse --port/--no-open args, start server, open browser | ~40 |
| Server setup | `src/dashboard/server.ts` | Configure Bun.serve(), routes, WebSocket | ~120 |
| API: status | `src/dashboard/api/status.ts` | GET /api/status (active session + timer) | ~30 |
| API: sessions | `src/dashboard/api/sessions.ts` | GET /api/sessions (log with date range) | ~40 |
| API: projects | `src/dashboard/api/projects.ts` | GET /api/projects (summaries + earnings) | ~30 |
| API: actions | `src/dashboard/api/actions.ts` | POST /api/actions/start, /api/actions/stop | ~60 |
| API: timeline | `src/dashboard/api/timeline.ts` | GET /api/timeline (day segments) | ~40 |
| WebSocket manager | `src/dashboard/ws/manager.ts` | Client set, broadcast, poll loop | ~80 |
| Dashboard service | `src/core/dashboard/dashboard-service.ts` | Timeline, earnings, comparison queries | ~150 |
| Dashboard types | `src/core/dashboard/types.ts` | Timeline segment, earnings types | ~40 |
| Frontend: index.html | `src/dashboard/public/index.html` | Single HTML page, view containers | ~50 |
| Frontend: style.css | `src/dashboard/public/style.css` | Dark theme, card layout, timeline | ~350 |
| Frontend: app.js | `src/dashboard/public/app.js` | Tab routing, WebSocket client, render dispatch | ~120 |
| Frontend: charts.js | `src/dashboard/public/charts.js` | Chart.js initialization and rendering | ~100 |

### Modified Components

| Component | Change | Risk |
|-----------|--------|------|
| `src/cli/index.ts` | Add `dashboard` subcommand via `subCommands.set()` | LOW -- one lazy import registration |
| `package.json` | Add `chart.js` dependency | LOW |
| Build script | Verify `--compile` embeds dashboard public/ files | MEDIUM -- needs testing |

### Unchanged Components (Reused As-Is)

| Component | How Dashboard Uses It |
|-----------|----------------------|
| `createReportService()` | `today()`, `week()`, `log()`, `allProjects()` power API endpoints |
| `createSessionService()` | `start()`, `stop()`, `now()` power quick actions + status |
| `getDb()` / `createRepositories()` | Shared DB connection -- same singleton |
| `computeSessionDuration()` | Duration calculation in timeline and earnings |
| All 7 repository functions | Session, project, note, tag, pulse reads |
| `loadConfig()` | Read project rates for earnings display |
| `resolveProject()` | Project lookup for start action |
| `TimeTrackerError` hierarchy | Error handling in API responses |

## Data Flow

### Read Path (Dashboard Loading)

```
Browser GET /api/today
  -> server.ts routes match
    -> handleToday()
      -> createReportService()
        -> repos.sessions.findByDateRange(...)
          -> SQLite SELECT (indexed, <1ms)
        -> aggregateByProject()
      -> Response.json({ success: true, data })
  -> Browser renders view
```

### Write Path (Quick Actions from Browser)

```
Browser clicks "Start" on project "acme"
  -> WebSocket sends { type: "start", project: "acme" }
  -> server.ts websocket.message handler
    -> createSessionService()
      -> lifecycleService.start("acme", "dashboard")
        -> SQLite INSERT
    -> ws.send({ type: "action_result", data: { success: true } })
  -> Next poll tick (1s) detects new active session
    -> broadcast { type: "status", data: { active: {...}, today: {...} } }
  -> All browser tabs update simultaneously
```

### Real-Time Path (Timer Tick)

```
setInterval (server-side, 1000ms)
  -> Read active session from DB
  -> Compute elapsed time
  -> Compare with last broadcast state
  -> If changed: broadcast to all WebSocket clients
  -> If unchanged: skip (no traffic)
```

## Directory Structure

```
src/
  cli/
    commands/
      dashboard.ts          <- NEW: starts server, opens browser
    index.ts                <- MODIFIED: register dashboard subcommand
  core/
    dashboard/              <- NEW: dashboard-specific service
      dashboard-service.ts
      types.ts
      index.ts
    session/                (unchanged)
    reports/                (unchanged)
  dashboard/                <- NEW: web server and frontend
    server.ts               <- Bun.serve() config, routes, WebSocket
    api/
      status.ts             <- GET /api/status
      sessions.ts           <- GET /api/sessions
      projects.ts           <- GET /api/projects
      actions.ts            <- POST /api/actions/*
      timeline.ts           <- GET /api/timeline
    ws/
      manager.ts            <- WebSocket client tracking + poll loop
    public/
      index.html            <- Single page, dark theme
      style.css             <- CSS custom properties, card layout
      app.js                <- Tab routing, WebSocket client, DOM updates
      charts.js             <- Chart.js setup and rendering
```

## Scalability Considerations

This is a local, single-user tool. "Scalability" means not degrading as data grows.

| Concern | Now (hundreds of sessions) | 1 year (thousands) | 3 years (tens of thousands) |
|---------|---------------------------|--------------------|-----------------------------|
| API response time | <5ms | <10ms (indexed queries) | <20ms (add LIMIT to log endpoint) |
| WebSocket broadcast | Trivial (1-2 clients) | Trivial | Trivial |
| DB poll interval | 1s, sub-ms query | 1s, sub-ms query | 1s, ~1-2ms query |
| Binary size | ~50MB (Bun runtime base) | Same | Same |
| Frontend bundle | ~60KB (Chart.js tree-shaken + app JS) | Same | Same |

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Daemon Process
**What:** Running the dashboard server as a background daemon with IPC to the CLI.
**Why bad:** SQLite write contention, pidfile management, crash recovery, process coordination.
**Instead:** Same-process Bun.serve() in the `tt dashboard` command.

### Anti-Pattern 2: Heavy Frontend Framework
**What:** Using React, Next.js, Vite, or any framework requiring its own build pipeline.
**Why bad:** Adds build complexity, dev server coordination, large bundle size for a local dashboard with 4 views.
**Instead:** Vanilla JS with template literals. Chart.js for charts. CSS for the timeline bar.

### Anti-Pattern 3: REST API Framework
**What:** Adding Hono, Express, or Elysia for ~10 API endpoints on a local-only server.
**Why bad:** Unnecessary dependency, middleware patterns that add complexity for zero auth/CORS needs.
**Instead:** Raw `Bun.serve()` route handlers returning `Response.json()`.

### Anti-Pattern 4: File Watching for Change Detection
**What:** Using `fs.watch` on the SQLite database or WAL file to detect changes.
**Why bad:** Platform-dependent, WAL writes don't always trigger filesystem events, multiple events per transaction.
**Instead:** 1-second poll interval reading from the in-process DB connection.

### Anti-Pattern 5: Duplicating Service Logic in API Handlers
**What:** Re-implementing report/session logic in API handlers instead of calling existing services.
**Why bad:** Logic divergence between CLI and dashboard, double maintenance burden.
**Instead:** API handlers are thin wrappers -- call the existing service, serialize to JSON.

### Anti-Pattern 6: Client-Side Data Fetching Waterfall
**What:** Loading the page, then fetching status, then fetching today, then fetching timeline sequentially.
**Why bad:** Perceived slow load. Each round-trip adds latency even on localhost.
**Instead:** The initial page load should fetch `/api/status` which returns everything needed for the default view (active session, today summary, project list) in a single response.

## Port Selection

Use port **7117** by default. Allow override via `--port` flag or `TT_DASHBOARD_PORT` env var. Check if port is in use before starting and show a clear error message with the `--port` flag suggestion.

## Browser Opening

After `Bun.serve()` starts, automatically open the URL in the default browser:
```typescript
Bun.spawn(["open", `http://localhost:${port}`])  // macOS
```

Add `--no-open` flag to suppress automatic browser opening.

## Graceful Shutdown

On SIGINT/SIGTERM:
1. Stop the poll interval (`clearInterval`)
2. Close all WebSocket connections
3. Stop the HTTP server (`server.stop()`)
4. Close the DB connection (`closeDb()`)
5. Exit cleanly

```typescript
process.on("SIGINT", () => {
  clearInterval(pollInterval)
  server.stop()
  closeDb()
  process.exit(0)
})
```

## Sources

- [Bun.serve WebSocket docs](https://bun.com/docs/runtime/http/websockets) - HIGH confidence
- [Bun single-file executables](https://bun.com/docs/bundler/executables) - HIGH confidence
- [Bun HTML & static sites](https://bun.com/docs/bundler/html-static) - HIGH confidence
- [Bun routes + websocket type issue #17871](https://github.com/oven-sh/bun/issues/17871) - HIGH confidence
- [Bun routes + websocket issue #18314](https://github.com/oven-sh/bun/issues/18314) - HIGH confidence
