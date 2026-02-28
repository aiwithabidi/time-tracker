# Architecture Research

**Domain:** CLI-first time tracking tool with hook-based auto-detection
**Researched:** 2026-02-27
**Confidence:** HIGH (component patterns verified against multiple production CLI tools; WakaTime heartbeat architecture, Timetrap session model, Timewarrior interval model)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Entry Points Layer                           │
├──────────────────────┬───────────────────────────────────────────────┤
│  Claude Code Hooks   │           CLI Binary (tt)                     │
│  (shell scripts)     │   start | stop | status | edit | week | ...   │
│  PreToolUse          │                                               │
│  PostToolUse         │                                               │
│  SessionStart        │                                               │
│  Stop                │                                               │
└──────────┬───────────┴──────────────────────┬────────────────────────┘
           │  pulse(terminalId, sessionId)     │  command + args
           ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Command Router                               │
│         Parses args → dispatches to command handler                  │
│         (CAC / citty / custom minimist wrapper)                      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
           ┌───────────────────┼────────────────────┐
           ▼                   ▼                    ▼
┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│  Session        │  │  Activity Pulse  │  │  Report/Query      │
│  Manager        │  │  Handler         │  │  Engine            │
│                 │  │                  │  │                    │
│  start()        │  │  recordPulse()   │  │  week()            │
│  stop()         │  │  detectIdle()    │  │  projects()        │
│  status()       │  │  autoPause()     │  │  history()         │
│  attach()       │  │  autoResume()    │  │  summary()         │
│  edit()         │  │                  │  │                    │
└────────┬────────┘  └────────┬─────────┘  └──────────┬─────────┘
         │                    │                        │
         └──────────────┬─────┘                        │
                        ▼                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Service Layer                                │
│                                                                      │
│   ProjectResolver    IdleDetector    GitCapture    ExportService     │
│   (dir → project)   (soft/hard)     (branch/SHA)  (CSV/JSON)        │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────┐
│                         Repository Layer                             │
│                                                                      │
│   SessionRepository   PulseRepository   ProjectRepository           │
│   (CRUD sessions)     (heartbeat log)   (config + rates)            │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────┐
│                         Storage Layer                                │
│                                                                      │
│       ~/.config/timetracker/timetracker.db  (SQLite, WAL mode)      │
│       ~/.config/timetracker/config.json     (project aliases)       │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Hook Scripts | Shell-level entry points; fire `tt pulse` on Claude Code lifecycle events | CLI Binary only (subprocess exec) |
| CLI Binary (tt) | Parse subcommands, validate args, format output to stdout | Command Router |
| Command Router | Map `tt <subcommand>` to handler, validate flag schemas (Zod) | Session Manager, Pulse Handler, Report Engine |
| Session Manager | Create/stop/attach/edit sessions; enforce singleton-per-project | Repository Layer, ProjectResolver, GitCapture |
| Activity Pulse Handler | Receive heartbeats, update last-seen timestamp, trigger idle checks | Session Manager, IdleDetector, Repository |
| Idle Detector | Compare last-seen timestamps to soft/hard thresholds; emit auto-pause/resume events | Session Manager |
| Report/Query Engine | Aggregate session data, format tables/summaries for terminal display | Repository Layer |
| ProjectResolver | Map working directory (or override) to canonical project name | ProjectRepository, config.json |
| GitCapture | Read current branch and HEAD SHA at session boundaries | Shell (git subprocess) |
| ExportService | Serialize sessions to CSV or JSON for external tools (ClickUp) | SessionRepository |
| SessionRepository | CRUD for sessions table; handles soft-delete | SQLite via Drizzle ORM |
| PulseRepository | Insert and query activity_pulses table | SQLite via Drizzle ORM |
| ProjectRepository | CRUD for projects table, rate history | SQLite via Drizzle ORM |

## Recommended Project Structure

```
src/
├── cli/                     # Entry point layer
│   ├── index.ts             # Binary entry point, bootstraps router
│   └── commands/            # One file per subcommand (start, stop, status, ...)
│       ├── start.ts
│       ├── stop.ts
│       ├── status.ts
│       ├── edit.ts
│       ├── pulse.ts          # Called by hooks (not user-facing)
│       ├── week.ts
│       ├── projects.ts
│       └── ...
├── core/                    # Domain/business logic — no I/O, fully testable
│   ├── session/
│   │   ├── SessionManager.ts
│   │   ├── IdleDetector.ts
│   │   └── types.ts
│   ├── pulse/
│   │   ├── PulseHandler.ts
│   │   └── types.ts
│   └── reports/
│       ├── ReportEngine.ts
│       └── formatters.ts
├── services/                # Orchestration — cross-cutting concerns
│   ├── ProjectResolver.ts
│   ├── GitCapture.ts
│   └── ExportService.ts
├── db/                      # Data layer
│   ├── schema.ts            # Drizzle schema definitions
│   ├── migrations/          # Drizzle migration files
│   ├── repositories/
│   │   ├── SessionRepository.ts
│   │   ├── PulseRepository.ts
│   │   └── ProjectRepository.ts
│   └── client.ts            # Singleton DB connection
├── hooks/                   # Claude Code shell scripts (not TypeScript)
│   ├── session-start.sh
│   ├── session-stop.sh
│   ├── pre-tool-use.sh
│   └── post-tool-use.sh
└── config/
    ├── ConfigLoader.ts      # Reads ~/.config/timetracker/config.json
    └── types.ts
```

### Structure Rationale

- **cli/commands/**: One file per subcommand keeps command surface small (<200 lines each); new commands are additive, not destructive
- **core/**: Zero I/O code — pure functions over domain types; makes unit testing fast and isolated
- **services/**: Orchestrates cross-cutting operations (resolver + git + export); sits between CLI and repositories
- **db/repositories/**: Repository pattern isolates SQL from business logic; each repository is independently swappable or mockable
- **hooks/**: Shell scripts rather than TypeScript because they must execute under 100ms; they exec the compiled `tt` binary and exit immediately

## Architectural Patterns

### Pattern 1: Heartbeat / Activity Pulse

**What:** Every Claude Code hook fires `tt pulse --terminal-id $TT_TERMINAL_ID --session-id $CLAUDE_SESSION_ID`. The pulse is written to a `pulses` table with a timestamp. A background timer (or on-demand check) compares the latest pulse timestamp to the current time to determine idle state.

**When to use:** When activity signals come from an external event source (hooks) rather than from polling. This is the WakaTime model adapted for CLI.

**Trade-offs:**
- Pro: hooks do minimal work (<10ms); no daemon required; survives terminal kills
- Pro: idle detection is derived from data, not from a running timer — no state to lose
- Con: idle detection is reactive, not proactive — pausing only happens when the next command runs, or when a polling interval fires

**Example:**
```typescript
// PulseHandler.ts — called by `tt pulse` subcommand
export async function recordPulse(
  terminalId: string,
  sessionId: string,
  projectId: string,
  repo: PulseRepository,
  sessionManager: SessionManager
): Promise<void> {
  await repo.insert({ terminalId, sessionId, projectId, timestamp: Date.now() })
  await sessionManager.ensureActive(projectId)
}
```

### Pattern 2: Singleton Session via Database Lock (Stateless Daemon)

**What:** No persistent daemon process. Instead, the database itself enforces the singleton-per-project invariant. Before creating a new session, the Session Manager queries for an open session (`end_time IS NULL`) for the project. If one exists, the new terminal "attaches" to it by writing its `terminal_id` into a `session_terminals` join table rather than creating a duplicate session.

**When to use:** Multi-terminal environments where preventing double-counting is critical. Avoids process management complexity of a daemon.

**Trade-offs:**
- Pro: no daemon to crash, restart, or manage PID files
- Pro: SQLite's WAL mode handles concurrent readers safely (multiple terminals reading status)
- Con: writes still serialize through SQLite locking — acceptable since write frequency is low (session events, not heartbeats per keystroke)
- Con: idle detection cannot fire unless something triggers a command invocation (mitigated by optional periodic pulse via cron/launchd)

**Example:**
```typescript
// SessionManager.ts — attach instead of duplicate
export async function ensureActive(
  projectId: string,
  terminalId: string,
  repo: SessionRepository
): Promise<Session> {
  const active = await repo.findActiveByProject(projectId)
  if (active) {
    await repo.attachTerminal(active.id, terminalId)
    return active
  }
  return repo.create({ projectId, terminalId, startedAt: Date.now() })
}
```

### Pattern 3: Repository Pattern with Drizzle ORM + bun:sqlite

**What:** Each entity (sessions, pulses, projects) has a dedicated repository class. Business logic calls repository methods; repositories own all SQL. Drizzle ORM provides type-safe schema definitions and query builders. The `bun:sqlite` driver (native, no compilation) provides the connection.

**When to use:** Always — this is the baseline for any persistent CLI tool. Separates schema from queries from business logic.

**Trade-offs:**
- Pro: Drizzle's schema-as-code enables type-safe queries with auto-completion; migration files are diffable
- Pro: `bun:sqlite` is synchronous by default — no async overhead for simple CLI commands
- Con: Drizzle's SQLite migration story is slightly more complex than raw SQL; worth accepting for type safety

### Pattern 4: Idle Detection via Threshold Comparison

**What:** No polling thread or timer required. Idle state is computed on-demand by comparing `NOW - lastPulseTimestamp` against configured thresholds. Soft idle (8 min) prompts user on next status check. Hard idle (20 min) auto-pauses the session in the database.

**When to use:** Stateless CLI tools where a persistent daemon would add complexity. Called either on each `tt status` invocation or by a lightweight launchd timer.

**Trade-offs:**
- Pro: completely stateless — thresholds are config values, not runtime state
- Pro: no timer drift, no background processes to leak
- Con: auto-pause is not instantaneous — it fires on next CLI invocation or timer tick

**Example:**
```typescript
// IdleDetector.ts
export function computeIdleState(
  lastPulseAt: number,
  nowMs: number,
  config: { softIdleMs: number; hardIdleMs: number }
): 'active' | 'soft-idle' | 'hard-idle' {
  const elapsed = nowMs - lastPulseAt
  if (elapsed >= config.hardIdleMs) return 'hard-idle'
  if (elapsed >= config.softIdleMs) return 'soft-idle'
  return 'active'
}
```

## Data Flow

### Hook-Triggered Pulse Flow

```
Claude Code fires lifecycle event (SessionStart, Stop, PreToolUse, PostToolUse)
    ↓
Shell hook script (~/.claude/hooks/*.sh)
    ↓  exec in <10ms
tt pulse --terminal-id $TT_TERMINAL_ID --session-id $CLAUDE_SESSION_ID
    ↓
Command Router → PulseHandler.recordPulse()
    ↓                         ↓
PulseRepository.insert()    SessionManager.ensureActive()
    ↓                         ↓
pulses table               sessions table (attach or create)
```

### Manual Start/Stop Flow

```
Developer: tt start [project]
    ↓
Command Router → SessionManager.start(project, options)
    ↓
ProjectResolver.resolve(cwd, override)    GitCapture.snapshot()
    ↓                                          ↓
canonical projectId                      { branch, sha }
    ↓──────────────────────────────────────────┘
SessionRepository.create({ projectId, branch, sha, startedAt })
    ↓
sessions table (new row, end_time NULL)
    ↓
stdout: "Started tracking [project] on branch [branch]"
```

### Idle Check / Auto-Pause Flow

```
launchd timer fires every 5 min   OR   `tt status` invoked
    ↓
SessionManager.checkIdle(activeSession)
    ↓
PulseRepository.getLatestForProject(projectId)
    ↓
IdleDetector.computeIdleState(lastPulseAt, now, config)
    ↓
'hard-idle' → SessionRepository.autoPause(sessionId, pausedAt: lastPulseAt + hardIdleMs)
'soft-idle' → warn on stdout only
'active'    → no-op
```

### Report Flow

```
tt week  OR  tt projects
    ↓
Command Router → ReportEngine.generate(query)
    ↓
SessionRepository.findByDateRange(from, to)   ProjectRepository.findAll()
    ↓                                              ↓
raw session rows with durations            project metadata + rates
    ↓──────────────────────────────────────────────┘
ReportEngine aggregates (group by project, sum durations, apply rate)
    ↓
formatters.ts (table / plain text / JSON)
    ↓
stdout
```

### Export Flow

```
tt export --format csv --from 2026-01-01 --to 2026-01-31
    ↓
ExportService.export(format, dateRange)
    ↓
SessionRepository.findByDateRange(from, to)
    ↓
ExportService.serialize(sessions, 'csv')
    ↓
stdout or --output file.csv
```

## Scaling Considerations

This tool is single-user local software. Scaling is not a concern at runtime. The relevant scaling axis is data volume over time.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 year of data (~5k sessions) | Default SQLite with WAL mode; no changes needed |
| 5 years of data (~25k sessions) | Add compound indexes on `(project_id, started_at)`; existing schema handles this |
| 10+ years / archive use | Add `tt archive --before 2024-01-01` to move old rows to archived_sessions; main table stays fast |

### Scaling Priorities

1. **First bottleneck:** Report queries scanning all sessions across all time — fix with compound index on `(project_id, started_at)` from day one
2. **Second bottleneck:** Export of large date ranges — stream rows rather than loading all into memory; Drizzle supports cursor-based iteration

## Anti-Patterns

### Anti-Pattern 1: Long-Running Daemon for Session State

**What people do:** Spawn a background daemon process that holds session state in memory, write a PID file, communicate via Unix socket.

**Why it's wrong:** Adds process lifecycle complexity (crash recovery, stale PID files, restart on reboot), required IPC serialization, and makes the system fragile against terminal kills. For a personal tool with one user and low write frequency, there is no benefit that justifies this overhead.

**Do this instead:** Store all state in SQLite. The database is the single source of truth. Each CLI invocation opens and closes the database connection. SQLite's WAL mode handles the minor concurrency from multiple terminals.

### Anti-Pattern 2: Polling for Activity from Hooks

**What people do:** Hook scripts start a polling loop or background timer that checks for activity every N seconds.

**Why it's wrong:** Hook scripts run in the critical path of Claude Code startup/shutdown. A polling loop in a hook would block or require backgrounding, making the hook unreliable and potentially causing 100ms+ startup latency.

**Do this instead:** Hooks are fire-and-forget. They exec `tt pulse` (a fast, stateless write to SQLite) and exit immediately. Idle detection runs on the receiving side, not in the hook.

### Anti-Pattern 3: Storing Session State in a JSON File

**What people do:** Track active sessions in a `~/.timetracker/active.json` file, parse it on every command.

**Why it's wrong:** Race conditions between multiple terminals writing simultaneously; no transactional guarantees; no query capability for reporting; manual migration story.

**Do this instead:** Use SQLite from the start. It handles concurrent access, provides ACID transactions, and queries replace hand-written aggregation logic.

### Anti-Pattern 4: One God Service Class

**What people do:** Put all business logic (session management, idle detection, reporting, export) into a single `TimeTracker` class.

**Why it's wrong:** Makes unit testing hard (must mock everything for any single test), violates single-responsibility, creates uncontrolled coupling between idle detection and export formats.

**Do this instead:** Separate SessionManager, IdleDetector, ReportEngine, ExportService. Each has one job, one set of dependencies, and is independently testable.

### Anti-Pattern 5: Tracking Every Keystroke / Tool Call as a Pulse

**What people do:** Fire a heartbeat on every PreToolUse/PostToolUse call (potentially dozens per minute).

**Why it's wrong:** At 60+ tool calls per hour, the pulses table grows unbounded. Write amplification is unnecessary — idle detection only needs to know the last-seen time.

**Do this instead:** Rate-limit pulse writes. Only insert if the last pulse for this terminal+project is older than 60 seconds (WakaTime uses 2 minutes). The hook checks the last inserted timestamp before writing, keeping the write load negligible.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code hooks | Shell script execs `tt pulse` as subprocess | Scripts must complete in <100ms; always fire-and-forget |
| Git | Shell subprocess: `git rev-parse HEAD`, `git branch --show-current` | Only at session start/end; not on every pulse |
| ClickUp (future) | Export to CSV/JSON → manual import | v1 does not call ClickUp API; data format must include project name, start, end, duration, notes |
| launchd (macOS) | Optional periodic plist to run `tt idle-check` every 5 minutes | Enables auto-pause even when no hooks fire |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Hook scripts → CLI binary | Process exec (subprocess) | No shared memory; env vars pass terminal/session IDs |
| CLI commands → Core | Direct TypeScript function calls | Commands are thin; all logic in core/ |
| Core → Repositories | Interface-typed method calls | Core depends on Repository interfaces, not concrete classes |
| Repositories → DB client | Drizzle ORM queries | Single shared `client.ts` instance; bun:sqlite is synchronous |
| Report Engine → Formatters | Pure function calls | Formatters take data arrays, return strings; no I/O |

## Suggested Build Order

Dependencies flow from bottom to top. Build in this order:

1. **DB schema + repositories** — Everything depends on this. Define `sessions`, `pulses`, `projects`, `session_terminals` tables with Drizzle. Write repositories with basic CRUD. No business logic yet.

2. **ProjectResolver + ConfigLoader** — Needed before SessionManager. Reads cwd, resolves project from config aliases.

3. **SessionManager (start/stop/attach)** — Core feature. Depends on repositories and ProjectResolver. Multi-terminal attach logic lives here.

4. **CLI binary + Command Router + `tt start` / `tt stop` / `tt status`** — First usable version. Manual tracking only. Wire commands to SessionManager.

5. **PulseHandler + IdleDetector** — Activity pulse writes and idle threshold logic. Depends on repositories and SessionManager. `tt pulse` subcommand.

6. **Hook scripts** — Shell wrappers calling `tt pulse`. Depend on the compiled binary being available.

7. **GitCapture** — Capture branch/SHA at session boundaries. Add to SessionManager.start().

8. **ReportEngine + `tt week` / `tt projects`** — Depends on SessionRepository with indexed queries. Aggregation and formatting.

9. **ExportService + `tt export`** — Depends on ReportEngine patterns. CSV and JSON serializers.

10. **Edit/split/merge/undo commands** — Depends on stable SessionRepository. Mutation operations on existing sessions.

## Sources

- WakaTime Plugin Architecture: [https://wakatime.com/help/creating-plugin](https://wakatime.com/help/creating-plugin) — Heartbeat/pulse pattern, rate-limiting, fire-and-forget from hooks (HIGH confidence, official docs)
- Timetrap CLI Architecture: [https://github.com/samg/timetrap](https://github.com/samg/timetrap) — Session model, command interface, SQLite storage, formatter extensibility (HIGH confidence, production open-source tool)
- Python CLI Time Tracker pattern: [https://dev.to/dmikhr/building-cli-time-tracker-with-python-o0g](https://dev.to/dmikhr/building-cli-time-tracker-with-python-o0g) — Three-layer CLI architecture, NULL finish_time for active session detection (MEDIUM confidence, single source)
- SQLite concurrent writes: [https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/) — WAL mode behavior for multi-terminal writes (HIGH confidence, technical deep-dive)
- Drizzle ORM + bun:sqlite integration: [https://orm.drizzle.team/docs/connect-bun-sqlite](https://orm.drizzle.team/docs/connect-bun-sqlite) — Official driver documentation (HIGH confidence, official docs)
- Bun CLI applications: [https://oneuptime.com/blog/post/2026-01-31-bun-cli-applications/view](https://oneuptime.com/blog/post/2026-01-31-bun-cli-applications/view) — Single binary compilation, CLI patterns with Bun (MEDIUM confidence)
- Daemon vs Direct Mode pattern: [https://deepwiki.com/steveyegge/beads/6.1-daemon-vs-direct-mode](https://deepwiki.com/steveyegge/beads/6.1-daemon-vs-direct-mode) — Rationale for stateless vs daemon architectures (MEDIUM confidence)
- Hexagonal Architecture for CLI tools: [https://tsh.io/blog/hexagonal-architecture](https://tsh.io/blog/hexagonal-architecture) — Multiple delivery mechanisms (CLI + future web) through same core (MEDIUM confidence)

---
*Architecture research for: CLI-first time tracking tool (TimeTracker)*
*Researched: 2026-02-27*
