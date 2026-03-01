# Research Summary: v1.2 Web Dashboard

**Domain:** Local web dashboard for CLI time tracker
**Researched:** 2026-02-28
**Overall confidence:** HIGH

## Executive Summary

The v1.2 web dashboard requires minimal stack additions to the existing Bun + bun:sqlite + drizzle-orm codebase. Bun's built-in HTTP server (`Bun.serve()`) and native WebSocket support eliminate the need for any server-side dependencies. The `routes` API (available since Bun v1.2.3) handles static file serving and API endpoints natively, with automatic ETag support added in v1.2.20. The project is running Bun 1.3.x, so all these features are available.

The only new dependency is Chart.js (^4.5.1) for bar and doughnut charts. Chart.js was chosen over uPlot (which lacks pie/doughnut support) and ApexCharts (2.5x larger bundle). With tree-shaking via selective component registration, the effective Chart.js bundle for bar + doughnut charts stays under 50KB.

The frontend should be vanilla JavaScript with plain CSS -- no React, no Vue, no Svelte, no build step. The dashboard has 4 views (Today, Week, Projects, Timeline) with server-driven data. A framework would add build tooling complexity for zero benefit in a single-user local tool. Modern browser APIs (fetch, WebSocket, template literals, CSS custom properties) cover all requirements. The session timeline visualization (color-coded horizontal bar) is better implemented as positioned HTML divs than as a chart.

The critical architectural insight is that the dashboard server reuses the existing service layer directly. The `tt dashboard` command starts a Bun HTTP server in the same process, calling `SessionService`, `ReportingService`, etc. as direct function calls. There is no separate API layer to build -- the "API" is JSON serialization of existing service responses. WebSocket real-time updates use a simple server-side polling loop (1-second interval checking active session state) that pushes changes to connected browser clients.

## Key Findings

**Stack:** Add only Chart.js ^4.5.1. Use Bun.serve() for HTTP + WebSocket (zero deps). Vanilla JS + plain CSS frontend (no build step).

**Architecture:** Dashboard server runs in-process, reusing existing service layer. WebSocket polls active session every 1s and pushes state changes. Quick actions (start/stop/switch) call same service methods as CLI.

**Critical pitfall:** WebSocket must not hold the SQLite connection open exclusively; it shares the same DB connection as the CLI services. WAL mode (already enabled) handles this safely for a single-writer scenario.

## Implications for Roadmap

Based on research, the dashboard milestone should be structured as follows:

1. **Phase 1: HTTP Server + Static Dashboard Shell** - Set up `Bun.serve()` with routes, serve static HTML/CSS/JS, implement `tt dashboard` CLI command that starts server and opens browser. No data yet -- just the shell with dark theme and tab navigation.
   - Addresses: Server infrastructure, `tt dashboard` command, dark theme UI
   - Avoids: Premature API design before UI structure is clear

2. **Phase 2: API Endpoints + Today View** - Implement `/api/status` and `/api/sessions` endpoints backed by existing services. Build the Today view with active session display, project breakdown doughnut chart, and session list.
   - Addresses: Core data display, Chart.js integration, API design
   - Avoids: Building all views at once before patterns are established

3. **Phase 3: WebSocket + Live Timer** - Add WebSocket connection for real-time updates. Live timer ticking, active/idle indicator, auto-refresh on session state changes.
   - Addresses: Real-time updates, live timer display
   - Avoids: Over-engineering the WebSocket protocol (keep it simple: server pushes full state object)

4. **Phase 4: Weekly View + Project Deep Dive** - Weekly summary with stacked bar chart (hours per project per day), week-over-week comparison. Project detail view with session history, notes, tags, earnings.
   - Addresses: Reporting views, advanced Chart.js usage
   - Avoids: N/A -- standard CRUD display

5. **Phase 5: Quick Actions + Timeline** - Start/stop/switch buttons in the dashboard. Session timeline (horizontal bar visualization). Earnings tracker.
   - Addresses: Interactivity, timeline visualization, earnings display
   - Avoids: Building interactive features before display features are solid

**Phase ordering rationale:**
- Server shell first because all other phases depend on it
- Today view before weekly because it validates the API pattern with the simplest case
- WebSocket after initial data display because live updates layer on top of working static views
- Quick actions last because they are the most complex (bidirectional communication, state mutation from browser)

**Research flags for phases:**
- Phase 1: Standard patterns, no research needed
- Phase 2: Standard patterns, no research needed
- Phase 3: WebSocket protocol design is straightforward but test idle detection interaction carefully
- Phase 4: Chart.js stacked bar configuration may need docs reference during implementation
- Phase 5: Timeline visualization is custom HTML/CSS, no library research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (Bun.serve + Chart.js) | HIGH | All capabilities verified against official docs and current versions |
| Frontend approach (vanilla JS) | HIGH | Scope is well-defined and small; modern browser APIs are sufficient |
| Architecture (in-process service reuse) | HIGH | Standard pattern; same DB, same services, just JSON serialization added |
| Pitfalls (WebSocket + SQLite) | HIGH | WAL mode already enabled; single-writer model well-understood |

## Gaps to Address

- **Chart.js dark theme configuration:** Chart.js defaults to light theme. Custom plugin or `defaults` override needed for dark backgrounds, light text, and muted grid lines. Address during Phase 2 implementation.
- **Browser auto-open behavior:** `open` command on macOS opens the default browser. If the user prefers a specific browser, this needs a config option. Low priority.
- **Dashboard and CLI concurrent access:** The dashboard server and CLI commands both access the same SQLite database. With WAL mode this is safe for reads + single writer, but test the scenario where `tt stop` is run from CLI while dashboard is polling. Should work due to existing WAL + busy timeout configuration.

## Sources

- [Bun HTTP Server docs](https://bun.com/docs/runtime/http/server)
- [Bun WebSocket docs](https://bun.com/docs/runtime/http/websockets)
- [Chart.js documentation](https://www.chartjs.org/docs/)
- [Chart.js npm (v4.5.1)](https://www.npmjs.com/package/chart.js)
- [uPlot GitHub (rejected)](https://github.com/leeoniya/uPlot)
- [Bun releases (v1.3.9 current)](https://github.com/oven-sh/bun/releases)

---
*Research completed: 2026-02-28*
*Ready for roadmap: yes*
