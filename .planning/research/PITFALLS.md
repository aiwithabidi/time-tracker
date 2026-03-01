# Domain Pitfalls: v1.2 Web Dashboard Addition

**Domain:** Adding local web dashboard to existing Bun CLI time tracker
**Researched:** 2026-02-28
**Overall confidence:** HIGH
**Scope:** Pitfalls specific to adding HTTP server, WebSocket, frontend assets, and real-time updates to the existing `tt` CLI tool. Does NOT repeat v1.0/v1.1 pitfalls (hook reliability, session lifecycle, idle detection) which are already solved.

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or broken user experience.

### Pitfall 1: Orphaned Server Process After Terminal Close

**What goes wrong:** User runs `tt dashboard`, the server starts on a port, they close the terminal or Ctrl+C fails to propagate cleanly. The server process becomes orphaned -- still running, still holding the port, still holding a database connection. Next `tt dashboard` invocation fails with EADDRINUSE. The user has no idea what process is holding the port and must resort to `lsof -i :PORT | grep LISTEN` to diagnose.

**Why it happens:** Every other `tt` command is fire-and-forget (runs in <100ms, exits). A long-running HTTP server is fundamentally different. Terminal close sends SIGHUP to the foreground process group, but if signal handlers are not registered or the process is backgrounded, it survives as an orphan. macOS does not aggressively reap user-space orphans.

**Consequences:**
- Port blocked, dashboard unusable until manual intervention
- Multiple orphaned servers accumulate, each holding SQLite connections (exacerbates WAL checkpoint starvation)
- Confusing error messages for a tool that prides itself on "just works"
- Database connections from dead servers prevent WAL checkpointing

**Prevention:**
- Write a PID file to `~/.tt/dashboard.pid` on server start
- On startup, check if PID file exists and whether that process is actually alive (`process.kill(pid, 0)`)
- If alive and responsive: skip server start, just open browser to existing instance
- If stale PID (process dead): remove PID file, start fresh
- Register signal handlers for SIGTERM, SIGINT, SIGHUP that clean up PID file, close database, and call `server.stop()`
- Add `tt dashboard stop` subcommand that reads PID file and sends SIGTERM
- Implement auto-shutdown: if no WebSocket clients connected for 30 minutes, server exits gracefully
- Store the port number alongside the PID in the PID file so reconnection works even with custom ports

**Detection:** Close terminal while dashboard is running. Run `tt dashboard` again. Also: `kill -9` the server process, then try to start again (tests stale PID recovery).

**Phase:** Phase 1 (server lifecycle). Must be correct from day one.

---

### Pitfall 2: SQLite Write Contention Between Server and Hook Processes

**What goes wrong:** The dashboard server holds a long-lived database connection to `~/.tt/tt.db`. Meanwhile, Claude Code hook scripts fire `tt pulse` as separate OS processes that each open their own SQLite connection. The existing codebase uses `BEGIN IMMEDIATE` transactions with a 5000ms `busy_timeout`. When the server processes a dashboard quick action (start/stop session) while a hook fires simultaneously, one writer gets SQLITE_BUSY if the transaction exceeds the timeout.

The hook scripts are fire-and-forget with `2>/dev/null` and `exit 0` -- they swallow errors silently. A failed pulse means missed heartbeat data, which triggers false idle detection and incorrect session durations.

**Why it happens:** The existing architecture was designed for short-lived CLI processes that hold write locks for milliseconds. A persistent server changes the concurrency profile entirely. The server might hold a write transaction while computing response data, broadcasting WebSocket messages, or waiting on I/O -- all of which extend the transaction window.

**Consequences:**
- Missed heartbeat pulses cause false idle detection
- Session durations become inaccurate without any visible error
- Dashboard shows "active" while the background tracking silently breaks
- The more the user interacts with the dashboard (quick actions), the more hook writes fail

**Prevention:**
- **Keep server write transactions under 10ms.** Commit before doing any I/O, WebSocket broadcast, or response serialization. The pattern is: BEGIN IMMEDIATE -> write -> COMMIT -> then broadcast/respond.
- **Never hold a transaction open across an await.** All database writes must be synchronous within the transaction (which they are with bun:sqlite's synchronous API, but be careful not to introduce async operations inside `withTransaction()`).
- **Consider server-mediated writes:** Instead of hook processes writing directly to SQLite, have them POST to the dashboard server's HTTP API (`curl -s http://localhost:PORT/api/pulse`). The server becomes the single writer, eliminating contention entirely. Fall back to direct SQLite write if server is not running.
- **Test concurrent access:** Run a loop of `tt pulse` every 100ms while clicking dashboard quick actions. Verify no SQLITE_BUSY errors.
- The existing `busy_timeout = 5000` is adequate for the short-lived process model but may need increase to 10000ms with a persistent server.

**Detection:** Wrap the existing hook scripts to log SQLITE_BUSY errors to `~/.tt/errors.log` (instead of `/dev/null`) during development. Monitor for write failures under concurrent load.

**Phase:** Phase 1 (server architecture). This is the most consequential architectural decision: whether the server is read-only or becomes the single writer.

---

### Pitfall 3: Embedding Static Assets in Compiled Binary

**What goes wrong:** The project compiles to `dist/tt` via `bun build --compile src/cli/index.ts --outfile dist/tt --minify`. Dashboard assets (HTML, CSS, JS) must be served from this binary. Bun supports embedding individual files via `import x from "./file.html" with { type: "file" }`, but there is no native directory embedding (GitHub issue #5445, still open as of 2026-02). If assets are not properly embedded, the compiled binary cannot find them and the dashboard returns 404.

**Why it happens:** Bun's `--compile` feature embeds files that are statically imported. Dynamic filesystem reads (`fs.readFileSync("./public/index.html")`) resolve against the actual filesystem, not the embedded bundle. When the compiled binary is moved away from the source tree (which is the entire point of compilation), those paths break.

**Consequences:**
- Dashboard works in `bun run dev` but 404s from the compiled binary
- Binary size unpredictable if large assets are embedded without minification
- Adding new asset files requires updating import statements (easy to forget)

**Prevention:**
- **Pre-bundle frontend into minimal files.** Use Bun's bundler to produce a single `dashboard.js` and single `dashboard.css` from all frontend source. Then embed just these 2-3 files plus `index.html`.
- **Create an `assets.ts` manifest file** that imports all embedded files in one place. This is the single source of truth for what gets embedded. New files = new import here.
- **Alternative: inline everything.** Generate HTML with inlined CSS and JS as template literals in TypeScript. Zero separate files to embed. This is the simplest approach for a dashboard with modest frontend complexity.
- **Add a build verification step:** After `bun build --compile`, move the binary to `/tmp/`, run it, and verify dashboard assets load. Add this to the test script.
- **Update `package.json` build script** to include a frontend build step before compilation.

**Detection:** Build the binary, copy it to a directory with no source files, run `./tt dashboard`, and check if assets load.

**Phase:** Phase 1 (build pipeline decision) and Phase 2 (frontend implementation). The approach (inline vs. file embedding) determines the entire frontend architecture.

---

## Moderate Pitfalls

### Pitfall 4: No Cross-Process SQLite Change Notification

**What goes wrong:** The dashboard shows a live timer and session status. When the CLI or hook process updates the database (new pulse, session start/stop), the dashboard needs to reflect the change in real-time. SQLite's `sqlite3_update_hook()` only fires for changes made on the same connection in the same process. The server has no way to know when a hook process has written to the database.

**Why it happens:** SQLite is an embedded database, not a client-server database. It has no inter-process notification bus. Changes from external processes are invisible to existing connections until they query again.

**Consequences:**
- Dashboard shows stale data (timer stuck, session status wrong) until the next poll
- User starts a session via CLI, dashboard does not update for seconds/minutes
- Creates impression that the dashboard is broken or unreliable

**Prevention:**
- **Poll `PRAGMA data_version` every 1-2 seconds.** This PRAGMA returns an integer that increments on each commit from any process. If it changes since last check, re-query affected data and push via WebSocket. This is extremely cheap (single integer read, no table scan).
- **Complement with hook-to-server notification:** Modify hook scripts to also `curl -s http://localhost:PORT/api/notify 2>/dev/null || true` after writing to SQLite. This gives near-instant updates when the server is running, with graceful fallback when it is not.
- **Do NOT use filesystem watchers on the database or WAL file.** This is fragile, fires too frequently (on every page write), and is platform-dependent. `PRAGMA data_version` is the correct abstraction.
- **Do NOT use `sqlite3_update_hook` and expect cross-process behavior.** It is explicitly same-process only per the [official SQLite documentation](https://sqlite.org/c3ref/update_hook.html).

**Detection:** Start a session via `tt start` in a terminal. Check whether the dashboard updates within 2 seconds. If it takes longer than the poll interval, the notification mechanism is broken.

**Phase:** Phase 2 (real-time updates). Polling is the Phase 2 solution; hook-to-server notification is a Phase 3 optimization.

---

### Pitfall 5: WebSocket Connection Death After Sleep/Wake

**What goes wrong:** User opens dashboard, closes laptop lid, opens it later. The WebSocket connection is dead (TCP connection terminated during sleep) but the browser does not fire `onclose` immediately. The dashboard shows a frozen timer, stale session status, and incorrect duration for minutes until the browser detects the dead connection.

**Why it happens:** TCP keep-alive timers and WebSocket ping/pong have intervals measured in minutes. During sleep, the kernel does not send TCP RST packets. The browser only discovers the dead connection on the next send/receive attempt.

**Consequences:**
- Dashboard shows wildly incorrect time (frozen timer shows time-of-sleep, not current time)
- User thinks tracking is active when it is stale
- No visible indicator that data is outdated

**Prevention:**
- **Client-side heartbeat ping every 5 seconds.** If no pong response within 3 seconds, assume connection is dead.
- **Reconnection with exponential backoff:** 1s, 2s, 4s, 8s, cap at 15s. On successful reconnect, request full state from server (do not rely on incremental messages).
- **Show a visible "Reconnecting..." banner** in the UI when the connection is lost. The user must know data may be stale.
- **Server-side cleanup for dead WebSocket clients:** If no ping received from a client for 30 seconds, close the connection and remove from the clients set to prevent memory leaks.
- **On reconnect, re-derive all UI state from a single `/api/state` endpoint.** Never assume incremental WebSocket messages were received.
- **Timer rendering must use local clock.** The dashboard should receive "session started at timestamp X" and compute elapsed time locally using `Date.now() - startTime`. A frozen WebSocket does not freeze the timer if rendering is clock-based rather than message-based.

**Detection:** Open dashboard, disconnect WiFi for 30 seconds, reconnect. Verify the banner appears, reconnection succeeds, and all data refreshes within 5 seconds.

**Phase:** Phase 2 (WebSocket implementation). This must be in the initial implementation, not bolted on later.

---

### Pitfall 6: WebSocket Memory Leak from Unclosed Connections

**What goes wrong:** Browser tabs are opened and never closed, or the browser crashes without sending a WebSocket close frame. The server maintains references to dead WebSocket connections in its connected clients set. Over time (days of running `tt dashboard`), memory grows as dead connections accumulate.

**Why it happens:** WebSocket `close` events are not always fired (browser crash, network change, laptop sleep). The server's polling interval continues iterating over dead connections and silently failing on `ws.send()`.

**Consequences:**
- Memory growth proportional to accumulated dead connections
- `ws.send()` errors on every polling tick for each dead connection
- Server eventually becomes sluggish

**Prevention:**
- Use Bun's built-in WebSocket `close` handler to remove connections from the set
- Implement server-side ping: if no pong within 30 seconds, remove the connection
- Wrap `ws.send()` in try-catch and remove connections that throw
- Cap maximum connections (realistically 1-3 for a local tool; reject if >10 as a safety valve)
- Log connection count periodically for observability

**Detection:** Server memory usage grows steadily over hours. Error logs show repeated WebSocket send failures.

**Phase:** Phase 2 (WebSocket implementation).

---

### Pitfall 7: Bun.serve Routes + WebSocket TypeScript Type Conflict

**What goes wrong:** Bun.serve's TypeScript type definitions do not allow specifying both `routes` and `websocket` handlers on the same server config object. The code works at runtime but fails `tsc --noEmit` (the project's existing `typecheck` script). This is a known bug in Bun's type definitions (issues #17849, #17871, #18314).

**Why it happens:** Bun's type definitions model `routes` and `websocket` as belonging to different overloads of the `Bun.serve()` function. TypeScript cannot satisfy both overloads simultaneously.

**Consequences:**
- `bun run typecheck` fails, breaking the existing CI/quality gate
- Developers scatter `@ts-ignore` comments, which masks real type errors
- `bun build --compile` may still work (it uses Bun's own type resolution), creating a false sense of correctness

**Prevention:**
- **Use the `fetch` handler pattern instead of `routes`.** The `fetch` handler has stable types that support `server.upgrade(req)` for WebSocket upgrades. Route matching can be done with a simple URL pattern check in the fetch handler -- the dashboard has very few routes (5-10 max).
- **If using `routes`:** Create a typed wrapper function that casts the config correctly in one place, not scattered across the codebase. Document why the cast is needed with a link to the Bun issue.
- **Pin and document the Bun version.** Bun v1.2.5+ improved WebSocket+routes support. Check if the type issue is resolved in the version you target.
- **Run `bun run typecheck` after adding server code** to catch this immediately.

**Detection:** Add server code with both routes and WebSocket, run `bun run typecheck`.

**Phase:** Phase 1 (server implementation). Determines the entire server API surface pattern.

---

### Pitfall 8: Dashboard Quick Actions Bypassing Service Layer

**What goes wrong:** The dashboard adds "start timer" / "stop timer" / "switch project" buttons. The HTTP handlers for these actions write directly to the database or duplicate logic, bypassing the existing service layer (`pulse-service.ts`, `edit-service.ts`, `session-service.ts`). Sessions created via dashboard lack rate snapshots, skip singleton enforcement, bypass idle detection, or miss undo snapshot creation.

**Why it happens:** It is tempting to write a simple `POST /api/start` handler that does `INSERT INTO sessions`. The service layer has complex orchestration (check for existing session, snapshot rate, create undo record) that is not obvious from the outside.

**Consequences:**
- Sessions without rate snapshots break billing calculations
- Multiple simultaneous active sessions violate the singleton constraint
- No undo snapshots means dashboard actions are irreversible (unlike CLI actions)
- CLI and dashboard produce different database states for the same logical operation
- Subtle bugs that only manifest when mixing CLI and dashboard usage

**Prevention:**
- **HTTP handlers MUST call service layer functions, never repositories directly.** The server is a thin transport layer over the same services the CLI uses.
- **Write integration tests:** "Starting a session via POST /api/start produces identical database state as `tt start`." Compare the database after each operation.
- **Extract service layer into a shared module** that both CLI commands and HTTP handlers import. Do not copy-paste logic.
- **The service layer is already well-factored** (session-service facade with edit-service, pulse-service underneath). The HTTP handlers should mirror the CLI command handlers in structure.

**Detection:** Start a session from the dashboard, then run `tt now` in the CLI. Verify the session appears with correct rate snapshot and all metadata. Then `tt undo` to verify the undo snapshot exists.

**Phase:** Phase 3 (quick actions). But the architecture decision (handlers call services) must be established in Phase 1 API design.

---

### Pitfall 9: Chart Library Binary Bloat

**What goes wrong:** Adding a charting library (Chart.js at 63KB min+gzip, D3 at 90KB+, amCharts at 400KB+) to the embedded frontend assets bloats the compiled binary. The current `dist/tt` binary is lean because the CLI has minimal JS dependencies. A full charting library can add 200-500KB to the embedded assets.

**Why it happens:** Charting libraries are designed for web apps served from CDNs with caching. In a compiled binary, every byte is embedded and loaded on every start. Tree-shaking helps but chart libraries often have tightly coupled rendering engines that resist elimination.

**Consequences:**
- Binary size increases 20-50% for charts that display simple bar/line data
- Compilation time increases
- Memory usage increases (embedded assets are held in memory)

**Prevention:**
- **Use Chart.js with selective registration.** Import only the chart types needed (bar, line, doughnut). Core is ~11KB, each chart type adds incrementally. Do NOT `import Chart from 'chart.js/auto'` (imports everything).
- **Use CSS-only visualizations where possible.** The session timeline (horizontal color-coded bar) is pure HTML/CSS with `display: flex` and percentage widths. The weekly grid is a CSS grid with colored cells. These require zero JS charting library.
- **Pre-bundle and minify** the frontend JS with Bun's bundler before embedding. This tree-shakes unused chart features and minifies the result.
- **Set a binary size budget:** "Dashboard adds no more than 300KB to dist/tt." Check this in the build script.
- **Consider lightweight alternatives:** [uPlot](https://github.com/leeoniya/uPlot) is ~35KB min for high-performance time-series charts. Or hand-roll SVG charts for the 3-4 chart types needed.

**Detection:** Compare `ls -la dist/tt` before and after adding the dashboard. Track binary size in CI.

**Phase:** Phase 2 (frontend). Choose the charting approach before building visualizations.

---

## Minor Pitfalls

### Pitfall 10: Port Selection Conflicts

**What goes wrong:** The dashboard uses a common port. Another dev tool (Vite, Next.js, etc.) already occupies it. Server crashes with EADDRINUSE.

**Prevention:**
- Use an uncommon default port (e.g., 7117). Avoid 3000-3999, 5000-5999, 8000-8999 ranges.
- Support `--port` flag and `TT_DASHBOARD_PORT` env var for override.
- On EADDRINUSE: check PID file. If another `tt dashboard`, reuse it (open browser). If different app, show clear error with instructions.
- Do NOT auto-increment ports -- makes URL unpredictable and breaks bookmarks. Fail clearly.
- Store active port in PID file (`PID:PORT`) for reconnection on non-default ports.

**Phase:** Phase 1 (server startup).

---

### Pitfall 11: Browser Auto-Open Race Condition

**What goes wrong:** `tt dashboard` starts the server and immediately opens the browser. The browser request arrives before the server is ready. User sees "connection refused."

**Prevention:**
- `Bun.serve()` is synchronous -- server is ready when the call returns. Auto-open after `Bun.serve()` should work, but verify with the compiled binary.
- Use `Bun.spawn(["open", url])` on macOS (no npm dependency needed).
- Print the URL to stdout: `Dashboard: http://localhost:7117` as fallback.
- Support `--no-open` flag for headless/SSH use cases.

**Phase:** Phase 1 (server startup flow).

---

### Pitfall 12: Server Startup Slowing Down Non-Dashboard Commands

**What goes wrong:** Dashboard server code gets imported at the top level of the CLI entry point. Even when running `tt now` or `tt pulse`, the server modules are loaded, adding startup latency. The project has a hard <100ms startup constraint for hook scripts.

**Prevention:**
- **Lazy-import the dashboard module.** Only `await import("./dashboard/server")` when the `dashboard` command is invoked. gunshi already supports lazy command loading -- follow the same pattern.
- Keep dashboard code in a separate directory (`src/dashboard/`) with no imports from the main CLI entry path.
- Verify: `time ./dist/tt now` must remain under 100ms after adding dashboard code.
- Frontend asset bundle should NOT be imported by the CLI entry point.

**Detection:** `time ./dist/tt now` before and after adding dashboard code. If it increases >10ms, there is a lazy-loading leak.

**Phase:** Phase 1 (command registration).

---

### Pitfall 13: Dark Theme Looking Generic

**What goes wrong:** Using a CSS framework's default dark mode produces a generic admin panel that clashes with the terminal-first aesthetic.

**Prevention:**
- No CSS framework. Dashboard is small enough for hand-written CSS.
- Terminal-inspired palette: dark background (#0d1117 or similar), muted accents, monospace font for data.
- Dense, flat layout. No rounded cards, shadows, or gradients.
- System font for UI text (`system-ui`), monospace for time/data values.
- Minimal color palette: 2-3 accent colors for projects, one highlight for active elements.
- Reference Ghostty's default theme for color inspiration.

**Phase:** Phase 2 (frontend).

---

### Pitfall 14: Content-Type Headers for Embedded Assets

**What goes wrong:** Server serves CSS as `text/plain` or JS as `application/octet-stream`. Browser refuses to apply styles or execute scripts.

**Prevention:**
- MIME type map: `.html` -> `text/html; charset=utf-8`, `.css` -> `text/css`, `.js` -> `application/javascript`, `.svg` -> `image/svg+xml`.
- If using inline approach (HTML template strings), this is moot -- single HTML response with everything inlined.
- CORS is NOT needed (same-origin, local). Do not add preemptively.
- Set `Cache-Control: no-store` for all responses (local tool, no caching benefit).

**Phase:** Phase 1 (static file serving).

---

### Pitfall 15: Client-Server Timer Drift

**What goes wrong:** Client displays a timer counting up with `setInterval`. Server pushes elapsed time via WebSocket every 1-2 seconds. Due to JavaScript timer imprecision and tick alignment, client timer drifts from server value. After 30 minutes, disagreement is visible.

**Prevention:**
- Client computes elapsed time from `Date.now() - sessionStartTimestamp` (local clock), not from accumulating `setInterval` ticks.
- Server sends the session start timestamp once; client derives elapsed locally.
- On each WebSocket state update, client can reconcile if the server's elapsed differs by >2 seconds.
- Never compute billable time on the client -- always use server values for financial data.

**Phase:** Phase 2 (timer display).

---

### Pitfall 16: XSS via Session Notes in Dashboard

**What goes wrong:** Session notes (entered via CLI `tt note`) contain HTML or script content. Dashboard renders notes with `innerHTML`, executing injected code.

**Prevention:**
- Use `textContent` instead of `innerHTML` for all user-provided fields.
- Or escape HTML: create element, set `textContent`, read `innerHTML`.
- This is a local tool (user attacking themselves), so the risk is low, but the habit matters.

**Phase:** Phase 2 (frontend rendering).

---

### Pitfall 17: Empty State UX

**What goes wrong:** Dashboard loads with no sessions today, no active timer, no projects. Empty charts, blank tables, zero values. User thinks dashboard is broken.

**Prevention:**
- Show explicit empty states: "No sessions tracked today. Start tracking with `tt start` or use the Start button."
- Hide charts when no data (empty doughnut is confusing).
- Show "Getting Started" guidance when zero sessions exist.

**Phase:** Phase 2 (frontend).

---

### Pitfall 18: WebSocket Message Format Without Schema

**What goes wrong:** Server sends ad-hoc JSON over WebSocket. Client assumes shapes that change during development. Runtime errors in the browser console are invisible to the developer.

**Prevention:**
- Define a TypeScript discriminated union for all message types:
  ```typescript
  type ServerMessage =
    | { type: 'state'; data: DashboardState }
    | { type: 'tick'; data: { elapsed: number } }
    | { type: 'session-changed'; data: { sessionId: string } }
  ```
- Validate client-to-server messages with Zod (already in the project).
- Keep payloads minimal -- send IDs, let client fetch full state on change.

**Phase:** Phase 2 (WebSocket protocol).

---

## Phase-Specific Warning Summary

| Phase | Pitfall | Severity | Key Mitigation |
|-------|---------|----------|----------------|
| Phase 1: Server foundation | Orphaned process (#1) | CRITICAL | PID file + signal handlers + auto-shutdown |
| Phase 1: Server foundation | SQLite write contention (#2) | CRITICAL | Short transactions, consider single-writer |
| Phase 1: Server foundation | Asset embedding decision (#3) | CRITICAL | Choose inline vs. file embedding early |
| Phase 1: Server foundation | Routes+WebSocket types (#7) | MODERATE | Use fetch handler pattern |
| Phase 1: Server foundation | Port conflicts (#10) | MINOR | Uncommon default + override flag |
| Phase 1: Server foundation | Lazy loading (#12) | MINOR | Dynamic import for dashboard module |
| Phase 1: Server foundation | Content-Type (#14) | MINOR | MIME type map |
| Phase 2: Frontend + real-time | Cross-process notification (#4) | MODERATE | Poll PRAGMA data_version |
| Phase 2: Frontend + real-time | WebSocket reconnection (#5) | MODERATE | Client heartbeat + backoff + banner |
| Phase 2: Frontend + real-time | WebSocket memory leak (#6) | MODERATE | Close handler + ping timeout + try-catch |
| Phase 2: Frontend + real-time | Chart library bloat (#9) | MODERATE | Selective imports or CSS-only charts |
| Phase 2: Frontend + real-time | Timer drift (#15) | MINOR | Clock-based rendering, not tick-based |
| Phase 2: Frontend + real-time | XSS via notes (#16) | MINOR | textContent, not innerHTML |
| Phase 2: Frontend + real-time | Empty states (#17) | MINOR | Explicit guidance messages |
| Phase 2: Frontend + real-time | Message schema (#18) | MINOR | TypeScript discriminated union |
| Phase 3: Quick actions | Service layer bypass (#8) | MODERATE | HTTP handlers call services, never repos |

---

## "Looks Done But Isn't" Checklist

- [ ] **Orphaned process:** Close terminal while dashboard is running, then `tt dashboard` again. Must either reuse existing server or start cleanly.
- [ ] **Kill -9 recovery:** `kill -9` the dashboard server, then `tt dashboard`. Must detect stale PID and start fresh.
- [ ] **Concurrent writes:** Run `for i in {1..100}; do tt pulse &; done` while clicking dashboard quick actions. Zero SQLITE_BUSY errors.
- [ ] **Compiled binary assets:** `cp dist/tt /tmp/ && /tmp/tt dashboard`. All assets load, no 404s.
- [ ] **Sleep/wake recovery:** Open dashboard, close laptop lid 30 seconds, open. Reconnection banner appears, data refreshes within 5 seconds.
- [ ] **Cross-process updates:** Run `tt start` in terminal while dashboard is open. Dashboard updates within 2 seconds.
- [ ] **Lazy loading:** `time ./dist/tt now` with dashboard code present. Must remain under 100ms.
- [ ] **Port conflict:** Start another server on dashboard port, then `tt dashboard`. Clear error message shown.
- [ ] **Service layer parity:** Start session from dashboard, verify with `tt now`, run `tt undo`. All must work identically to CLI.
- [ ] **Binary size:** `ls -la dist/tt` after dashboard. No more than 300KB increase.
- [ ] **Dark theme:** Screenshot dashboard. Does it look like a terminal tool or a Bootstrap admin panel?

---

## Sources

- [SQLite WAL Mode Documentation](https://sqlite.org/wal.html) -- concurrent access semantics, checkpoint behavior
- [SQLite Data Change Notification Callbacks](https://sqlite.org/c3ref/update_hook.html) -- update_hook is same-process only
- [SQLite Forum: Cross-process notification via PRAGMA data_version](https://sqlite.org/forum/info/d2586c18e7197c39c9a9ce7c6c411507c3d1e786a2c4889f996605b236fec1b7)
- [SQLite Concurrent Writes and "database is locked"](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/) -- BEGIN IMMEDIATE prevents deadlocks
- [SQLITE_BUSY Despite Setting Timeout](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/) -- transaction upgrade pitfall
- [Abusing SQLite to Handle Concurrency (SkyPilot)](https://blog.skypilot.co/abusing-sqlite-to-handle-concurrency/) -- busy_timeout patterns
- [Bun Single-File Executable Documentation](https://bun.com/docs/bundler/executables) -- file embedding with `{ type: "file" }`
- [Bun Issue #5445: Embed Directory in Executable](https://github.com/oven-sh/bun/issues/5445) -- no native directory embedding, still open
- [Bun Issue #17871: Routes + WebSocket Type Conflict](https://github.com/oven-sh/bun/issues/17871)
- [Bun Issue #18314: Routes + WebSocket Runtime](https://github.com/oven-sh/bun/issues/18314)
- [Bun Issue #17849: Routes + WebSocket Type Definitions](https://github.com/oven-sh/bun/issues/17849)
- [Bun WebSocket Documentation](https://bun.com/docs/runtime/http/websockets)
- [Bun Issue #4175: sqlite3_update_hook Request](https://github.com/oven-sh/bun/issues/4175)
- [Bun Discussion #14318: Real-time SQLite Events](https://github.com/oven-sh/bun/discussions/14318)
- [Using Bun Compile to Embed Express/Vite App](https://dev.to/calumk/using-bun-compilebuild-to-embed-an-express-vite-vue-application-1e41)
- [Chart.js](https://www.chartjs.org/) -- tree-shakeable, ~11KB core
- [sindresorhus/open](https://github.com/sindresorhus/open) -- cross-platform browser opening

---
*Pitfalls research for: v1.2 Web Dashboard addition to tt CLI time tracker*
*Researched: 2026-02-28*
