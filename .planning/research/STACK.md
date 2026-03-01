# Technology Stack: v1.2 Web Dashboard

**Project:** TimeTracker Web Dashboard
**Researched:** 2026-02-28
**Scope:** Additions to existing Bun + bun:sqlite + drizzle-orm stack for local web dashboard
**Overall confidence:** HIGH

---

## Recommended Stack Additions

Only ONE new dependency is needed. Everything else is built into Bun or already in the project.

### HTTP Server & WebSocket

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Bun.serve() | Bun 1.3.x (native) | HTTP server + WebSocket | Zero dependencies. Bun's built-in server handles HTTP requests and WebSocket upgrades in a single `Bun.serve()` call. Native WebSocket support is built on uWebSockets (7x more req/s than Node + ws). The `routes` API (v1.2.3+) supports path parameters, static file serving via `Bun.file()`, and automatic ETag headers (v1.2.20+). A local dashboard with 5-6 routes does not need a framework. |

**Why not Hono/Elysia:** This is a local tool with 4-5 API routes and a static file serve. A framework adds a dependency, an abstraction layer, and middleware patterns for zero benefit at this scale. `Bun.serve()` handles routing, static files, and WebSocket in ~50 lines.

**Server pattern:**
```typescript
Bun.serve({
  port: 7117,
  routes: {
    "/": Bun.file("./src/dashboard/public/index.html"),
    "/style.css": Bun.file("./src/dashboard/public/style.css"),
    "/app.js": Bun.file("./src/dashboard/public/app.js"),
    "/charts.js": Bun.file("./src/dashboard/public/charts.js"),
    "/api/status": () => getStatus(),
    "/api/sessions": (req) => getSessions(req),
    "/api/projects": () => getProjects(),
  },
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") {
      server.upgrade(req);
      return;
    }
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) { /* client connected */ },
    message(ws, msg) { /* handle start/stop/switch commands */ },
    close(ws) { /* cleanup */ },
  },
});
```

### Frontend Approach

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vanilla JS + HTML | N/A | Dashboard UI | No build step, no bundler, no node_modules bloat. A local dashboard with 3-4 views does not need React, Vue, or Svelte. Modern browser APIs (fetch, WebSocket, template literals, CSS custom properties) cover everything needed. Ship plain HTML/CSS/JS files served directly by Bun. |

**Why not React/Vue/Svelte:** This dashboard has ~4 views with server-driven data. There is no complex client state, no routing between dozens of views, no form-heavy workflows. A framework would add: a build pipeline, a bundler config, HMR setup, framework-specific knowledge -- all for a tool only one person uses locally. Vanilla JS with modern DOM APIs is simpler, faster to load, and zero-dependency.

**Why not HTMX:** Tempting for server-rendered HTML, but the real-time timer requires client-side JS anyway (WebSocket connection + DOM updates every second for the live timer). Once you need that much client JS, HTMX adds a layer without reducing complexity.

**Approach:** Single HTML file with client-side tab switching. Each "view" (Today, Week, Projects, Timeline) is a JS module that renders into a container. Data fetched via `fetch()` on tab switch, live updates pushed via WebSocket.

### Charting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Chart.js | ^4.5.1 | Bar charts, doughnut charts | Best balance of features and size for this use case. Supports bar (weekly hours per project per day), doughnut (project time breakdown), and line (trends) -- all required chart types. Tree-shakeable via selective component registration. ~50KB when tree-shaken to bar + doughnut only. Well-documented, no framework dependency, works with vanilla JS and `<canvas>`. |

**Why not uPlot:** uPlot is smaller (~50KB full) and faster for time-series, but it does NOT support pie or doughnut charts. The project breakdown view needs a doughnut chart. uPlot only supports line, area, OHLC, and bar. Missing a core chart type is a dealbreaker. (Verified: uPlot v1.6.32, GitHub README explicitly lists supported types.)

**Why not D3:** Massive overkill. D3 is a low-level visualization toolkit. Building a bar chart in D3 takes 50+ lines vs 10 lines in Chart.js. No justification for a local dashboard.

**Why not ApexCharts:** Larger bundle (~125KB), heavier runtime. Good library but oversized for 3 chart instances in a local tool.

**Tree-shaking approach for minimal bundle:**
```typescript
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale,
  DoughnutController, ArcElement, Tooltip, Legend, Colors
} from 'chart.js';

Chart.register(
  BarController, BarElement, CategoryScale, LinearScale,
  DoughnutController, ArcElement, Tooltip, Legend, Colors
);
```

This registers only bar + doughnut support, keeping the effective bundle well under 50KB.

**Note on timeline visualization:** The session timeline (color-coded horizontal bar showing project switches throughout a day) does NOT need Chart.js. It is better implemented as plain HTML `<div>` elements with absolute positioning and CSS backgrounds. This avoids fighting Chart.js's axis model for a non-standard visualization.

### CSS Approach

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Plain CSS with custom properties | N/A | Dark theme styling | No build step needed. CSS custom properties handle theming natively. A single CSS file with ~300-400 lines covers a dark dashboard with cards, tables, and charts. No preprocessor, no Tailwind (needs build), no CSS-in-JS (needs framework). |

**Dark theme palette (GitHub-dark inspired, matches terminal aesthetic):**
```css
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-card: #1c2128;
  --border: #30363d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --accent: #58a6ff;
  --success: #3fb950;
  --warning: #d29922;
  --danger: #f85149;
  --font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
}
```

---

## What NOT to Add

| Category | Don't Add | Why Not |
|----------|-----------|---------|
| HTTP framework | Hono, Elysia, Express | 5 routes don't need a framework; Bun.serve() is sufficient |
| Frontend framework | React, Vue, Svelte | 4 views with server-driven data; vanilla JS is simpler, no build step |
| CSS framework | Tailwind, Bootstrap | Needs build pipeline; ~300 lines of custom CSS is enough |
| Bundler | Vite, webpack, esbuild | No JSX, no TypeScript in browser, no imports to resolve; plain `<script>` tags work |
| State management | Redux, Zustand, signals | Server is source of truth via WebSocket; client state is trivial (active tab, timer display) |
| WebSocket library | Socket.IO, ws | Bun has native WebSocket; browser has native WebSocket API |
| Template engine | EJS, Handlebars, Pug | Template literals in JS are sufficient for 4 views |
| Router (client) | React Router, page.js | Tab switching via event listeners; no URL routing needed for a local tool |
| Testing (frontend) | Playwright, Cypress | Local tool, single user; visual inspection sufficient for UI; backend API tested via existing test suite |
| Live reload | browser-sync, livereload | Development convenience not worth a dependency; manual refresh is fine |

---

## Integration Points with Existing Stack

### Direct Service Reuse (Critical Design Decision)

The web server imports and uses the SAME service layer as the CLI. No separate API abstraction needed.

```
src/services/session-service.ts    --> API routes call these directly
src/services/reporting-service.ts  --> Report/chart data endpoints
src/services/session-query-service.ts --> Session listing/filtering
src/db/repositories/               --> Same repository layer, same SQLite DB
```

The dashboard server runs in the same Bun process, accessing the same database file. This is a local tool -- the "API" is just function calls with JSON serialization on the response.

### WebSocket Real-Time Updates

The WebSocket broadcasts state changes to connected browser clients. Implementation approach:

1. **Server polls active session** every 1 second via `setInterval`
2. When state changes (session started/stopped, idle status changed), push update to all connected clients
3. Client receives update and re-renders the affected view component
4. Timer display updates client-side between server pushes (client-side `setInterval` for smooth seconds counting)

No need for a pub/sub system or event emitter library. A simple polling loop on the server + `ws.send()` covers this.

### CLI Command Integration

The `tt dashboard` command:
1. Starts the HTTP server via `Bun.serve()`
2. Opens the browser: `Bun.spawn(["open", `http://localhost:${port}`])`
3. Keeps the process running until Ctrl+C
4. Reuses existing service instances (same DB connection, same config)

### Quick Actions (Start/Stop/Switch from Browser)

POST endpoints or WebSocket messages that call the same service methods as CLI commands:
- `POST /api/start` --> `sessionService.startSession(project)`
- `POST /api/stop` --> `sessionService.stopSession()`
- `POST /api/switch` --> `sessionService.stopSession()` then `sessionService.startSession(newProject)`

### Port Convention

Use port `7117` as default (easy to remember). Configurable via `TT_DASHBOARD_PORT` env var or config file.

---

## File Organization for Dashboard

```
src/
  dashboard/
    server.ts              -- Bun.serve() setup, routes, WebSocket handler
    api/
      status.ts            -- GET /api/status (active session, timer, idle state)
      sessions.ts          -- GET /api/sessions?range=today|week|month
      projects.ts          -- GET /api/projects (summaries with earnings)
      actions.ts           -- POST /api/start, /api/stop, /api/switch
    public/
      index.html           -- Single HTML file, all views as tab sections
      style.css            -- Dark theme, card layout, responsive
      app.js               -- Main JS: tab routing, WebSocket client, DOM updates
      charts.js            -- Chart.js initialization and data rendering
```

Total new files: ~8 files. No new directories outside `src/dashboard/`.

---

## Installation

```bash
# Only ONE new dependency
bun add chart.js
```

Everything else is built into Bun (HTTP server, WebSocket, static file serving) or already in the project (luxon for dates, zod for validation, existing service layer).

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| HTTP server | Bun.serve() | Hono on Bun | Framework overhead for 5 routes; adds abstraction without benefit |
| HTTP server | Bun.serve() | Elysia | Same as Hono; even more opinionated, unnecessary for local tool |
| Frontend | Vanilla JS | Svelte (compiled) | Requires build step and tooling for 4 views; overkill |
| Frontend | Vanilla JS | Preact + HTM | Smaller than React but still adds JSX-like syntax and virtual DOM for no benefit |
| Charts | Chart.js 4 | uPlot | No pie/doughnut support; time-series only |
| Charts | Chart.js 4 | ApexCharts | 2.5x larger bundle (~125KB vs ~50KB tree-shaken) |
| Charts | Chart.js 4 | D3.js | Low-level toolkit, not a charting library; 10x more code for same result |
| CSS | Plain CSS | Tailwind CSS | Requires build pipeline (PostCSS); utility classes add learning curve for ~300 lines of CSS |
| CSS | Plain CSS | Open Props | Nice custom properties library but adds a dependency for something trivially hand-written |
| WebSocket | Bun native | Socket.IO | 70KB+ library for features not needed (rooms, namespaces, fallbacks); local tool has one client |
| Real-time | Server polling + push | SSE (Server-Sent Events) | SSE is one-directional; need bidirectional for quick actions (start/stop from browser) |

---

## Version Verification

| Technology | Version | Verified Date | Source |
|------------|---------|---------------|--------|
| Bun | 1.3.9 | 2026-02-28 | [Bun releases](https://github.com/oven-sh/bun/releases) |
| Bun.serve routes API | Available since v1.2.3 | 2026-02-28 | [Bun HTTP Server docs](https://bun.com/docs/runtime/http/server) |
| Bun native WebSocket | Built-in (uWebSockets) | 2026-02-28 | [Bun WebSocket docs](https://bun.com/docs/runtime/http/websockets) |
| Chart.js | 4.5.1 | 2026-02-28 | [npm chart.js](https://www.npmjs.com/package/chart.js) |
| uPlot | 1.6.32 (rejected) | 2026-02-28 | [GitHub](https://github.com/leeoniya/uPlot) |

---

## Confidence Assessment

| Decision | Confidence | Rationale |
|----------|------------|-----------|
| Bun.serve() for HTTP + WS | HIGH | Official Bun documentation, actively maintained, project already uses Bun |
| Vanilla JS (no framework) | HIGH | Scope is 4 views with server-driven data; standard web APIs are sufficient |
| Chart.js for charting | HIGH | Verified chart type support, tree-shaking docs, active maintenance, version confirmed |
| Plain CSS | HIGH | Standard approach, no verification needed |
| No additional dependencies beyond Chart.js | HIGH | All capabilities verified as built-in to Bun or browser APIs |

---

## Sources

- [Bun HTTP Server documentation](https://bun.com/docs/runtime/http/server) -- routes API, static file serving, ETag support
- [Bun WebSocket documentation](https://bun.com/docs/runtime/http/websockets) -- native WebSocket, pub/sub, compression
- [Bun v1.2.20 blog post](https://bun.com/blog/bun-v1.2.20) -- automatic ETag headers for static routes
- [Chart.js documentation](https://www.chartjs.org/docs/) -- chart types, tree-shaking, Canvas rendering
- [Chart.js integration guide](https://www.chartjs.org/docs/latest/getting-started/integration.html) -- selective component registration
- [Chart.js npm](https://www.npmjs.com/package/chart.js) -- version 4.5.1 confirmed
- [uPlot GitHub](https://github.com/leeoniya/uPlot) -- confirmed no pie/doughnut support (v1.6.32)
- [Bun releases](https://github.com/oven-sh/bun/releases) -- v1.3.9 current

---
*Stack research for: v1.2 Web Dashboard (additions to existing CLI stack)*
*Researched: 2026-02-28*
