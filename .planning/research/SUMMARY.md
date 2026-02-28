# Project Research Summary

**Project:** CLI-first time tracking tool for freelance developers
**Domain:** Developer productivity CLI with Claude Code hook integration
**Researched:** 2026-02-27
**Confidence:** HIGH

## Executive Summary

This is a CLI-first time tracking tool built specifically for freelance developers who use Claude Code. The product's core differentiator is automatic session detection via Claude Code lifecycle hooks (SessionStart, Stop, PreToolUse, PostToolUse), which eliminates manual time tracking entirely. Research across comparable tools (Watson, Timewarrior, Timetrap, WakaTime) confirms a well-understood domain with established patterns — but this project adds a novel integration layer that introduces significant reliability engineering challenges that must be addressed from day one, not retrofitted.

The recommended approach is a stateless, heartbeat-driven architecture with SQLite as the single source of truth and no persistent daemon process. Sessions are created and closed based on heartbeat staleness rather than on point-in-time hook events. This is essential because Claude Code's Stop and SessionStart hooks are documented as unreliable — they silently fail in multiple production scenarios including after-tool-call terminations and sessions longer than ~2.5 hours. Every architectural decision flows from this constraint: hooks are fire-and-forget, the database handles all state, and the CLI binary processes idle detection on-demand rather than via a running timer.

The critical risks are all Phase 1 schema decisions that cannot be changed without migrations: UTC millisecond timestamps with IANA timezone column storage (not timezone strings), rate-at-time snapshots on each session (not current-rate derivation), terminal identity via TT_TERMINAL_ID with singleton-per-project enforcement (not singleton-per-terminal), and WAL mode enabled from first database open. Choosing the wrong approach on any of these creates billing integrity failures — orphaned open sessions, double-counted hours, corrupted historical rates — that directly damage client billing and user trust.

## Key Findings

### Recommended Stack

The stack is built entirely on Bun's native capabilities with zero native compilation required. Bun's built-in SQLite driver (bun:sqlite) outperforms better-sqlite3 by 3-6x and eliminates native module compilation. gunshi handles CLI argument parsing with first-class TypeScript type safety and lazy subcommand loading that keeps cold start under 50ms. drizzle-orm provides type-safe schema definitions and query builders over bun:sqlite. luxon provides Duration and Interval types that map directly to time-tracking arithmetic, with immutable API and IANA timezone support via Intl.

A critical constraint: Bun does not yet implement the native Temporal API (open issue #15853). Do not use `Temporal` directly. Use luxon ^3.7 instead. Similarly, Prisma is explicitly excluded — its background daemon process adds 200ms+ startup time, violating the <100ms hook constraint.

**Core technologies:**
- **Bun >=1.2**: Runtime, package manager, bundler, test runner — mandated by project; native TypeScript, built-in SQLite, fast startup
- **gunshi ^0.27**: CLI framework — TypeScript-native argument parsing, lazy subcommands, chosen over Commander/Citty for 2025 TS projects
- **drizzle-orm + drizzle-kit ^0.45**: ORM and migrations over bun:sqlite — type-safe queries, schema-as-code, diffable migrations
- **bun:sqlite (built-in)**: Local storage — zero deps, synchronous API, WAL mode, 3-6x faster than better-sqlite3
- **luxon ^3.7**: Date/time math — Duration and Interval types, IANA timezone, immutable API
- **ink ^6.8 + @inkjs/ui ^2.0**: Terminal UI for dashboards — React component model, flexbox layout, actively maintained
- **vitest ^3**: Testing — required over bun test for safe env-var mocking, critical for CLI tools reading env vars
- **zod ^3.24**: Runtime validation — config files, hook payloads, CLI option schemas

### Expected Features

See `.planning/research/FEATURES.md` for full feature table with competitor analysis.

**Must have (table stakes):**
- Start/stop timer with status command — core tracking loop
- Project/client grouping — required for billable-hours billing workflow
- Manual time entry and edit past entries — corrections are non-negotiable
- Weekly and per-project reports — primary billing artifact
- CSV export — portability to ClickUp and invoicing tools
- Local data storage only — offline-first, no cloud dependency
- Claude Code hook integration (SessionStart/Stop/PreToolUse/PostToolUse) — the core differentiator
- Multi-terminal singleton via TT_TERMINAL_ID — prevents double-counting
- Idle detection with auto-pause — prevents runaway sessions overnight

**Should have (competitive differentiators, add at v1.x):**
- Hourly rate per project with billable totals — first-class billing math
- Undo last operation — missing from all competitors; reduces data anxiety
- Session split/merge commands — ergonomic session correction
- Git context capture (branch/SHA at boundaries) — automatic "what did I work on?"
- Session notes and tags — richer reporting context
- TUI live dashboard with ink — replaces CLI log parsing for daily review

**Defer (v2+):**
- Activity pattern analytics — requires 2+ weeks of data; complex to surface usefully
- Natural language time parsing ("yesterday 2pm") — add when manual correction workflow is established
- Web dashboard — explicitly out of scope in v1
- Per-session rate snapshots with historical rate change tracking — after rates change in practice

**Anti-features (never build):**
- Pomodoro timer, invoice generation, browser/app activity tracking, team/collaborative features, cloud sync, direct third-party API push, real-time keystroke monitoring, mobile app

### Architecture Approach

The system uses a layered architecture with strict separation between the CLI entry point layer (command parsing, output formatting), core domain layer (zero I/O, pure functions — SessionManager, IdleDetector, ReportEngine), services layer (cross-cutting orchestration — ProjectResolver, GitCapture, ExportService), repository layer (all SQL via Drizzle, each entity isolated), and storage layer (SQLite with WAL mode at `~/.config/timetracker/timetracker.db`). Claude Code hooks are shell scripts that exec the compiled `tt` binary; they never run TypeScript directly.

The two defining architectural patterns are the **heartbeat/activity pulse model** (WakaTime-inspired: hooks write pulses to a `pulses` table; idle state is derived from pulse staleness, never from a running timer) and the **stateless singleton session** (no daemon; SQLite enforces singleton-per-project via `end_time IS NULL` query; multi-terminal attach via `session_terminals` join table rather than duplicate sessions).

**Major components:**
1. **Hook Scripts (shell)** — fire-and-forget entry points, exec `tt pulse` and exit; <100ms target; never contain business logic
2. **CLI Binary / Command Router** — parses subcommands via gunshi, dispatches to handlers; validates with Zod
3. **Session Manager** — create/stop/attach sessions; singleton-per-project enforcement; depends on repositories
4. **Activity Pulse Handler + Idle Detector** — receives heartbeats, computes idle state from threshold comparison; fully stateless
5. **Report/Query Engine + ExportService** — aggregates sessions by date range and project; formats for terminal or CSV/JSON
6. **Repository Layer (Session, Pulse, Project)** — all SQL isolated here; business logic never writes raw SQL
7. **ProjectResolver** — maps CWD to canonical project via git root detection, then config file override
8. **GitCapture** — runs only `git rev-parse HEAD` and `git branch --show-current` at session boundaries; never in hooks

### Critical Pitfalls

1. **Claude Code Stop/SessionStart hooks are unreliable** — Stop hooks silently fail after ~2.5 hours, after tool calls, and in Skills; SessionStart fails for new conversations. Design for this from day one: heartbeat-based lifecycle (session is "open" while heartbeats are fresh), startup reconciliation (close stale sessions on next SessionStart), idempotent hook scripts, 24-hour max session cap. This cannot be retrofitted.

2. **SQLite locking with concurrent terminals** — Multiple hook processes writing simultaneously causes SQLITE_BUSY without WAL mode and busy timeout. Enable `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000` immediately on first DB open. Use `BEGIN IMMEDIATE` for all write transactions. Never open the database without these settings.

3. **Orphaned open sessions from SIGKILL** — Force Quit and OOM kills bypass all cleanup code; Stop hook never runs. Same mitigation as Pitfall 1: heartbeat timeout IS the implicit session end time. Sessions without recent heartbeats are treated as stale. Reports use `COALESCE(ended_at, last_heartbeat + grace_period)` as effective end time.

4. **Double-counting across multiple terminals** — Without TT_TERMINAL_ID and singleton enforcement, 3 terminals in the same project directory create 3 sessions and triple tracked hours. This is the most damaging billing accuracy failure. Must be a Phase 1 schema constraint — adding it later requires a data migration.

5. **Schema decisions that cannot be fixed after data accumulates** — Three decisions are permanent once data exists: (a) store timestamps as UTC milliseconds with IANA zone column, not timezone strings; (b) snapshot `rate_at_time` on each session, not derive from current project rate; (c) use `end_time IS NULL` singleton enforcement with terminal attach semantics. All three must be in the initial schema.

## Implications for Roadmap

Based on combined research, the architecture's build order and pitfall prevention requirements suggest the following phase structure:

### Phase 1: Foundation and Core Session Lifecycle

**Rationale:** Every feature depends on the database schema and session lifecycle. The most critical pitfalls (double-counting, orphaned sessions, timezone corruption, rate history corruption) are all schema-level decisions that cannot be changed without migrations. This phase establishes the permanent shape of the data model. No user-visible features ship until this is solid.

**Delivers:** SQLite database with correct schema, WAL mode configured, repository layer, ProjectResolver, SessionManager with singleton enforcement, TT_TERMINAL_ID terminal identity, heartbeat reconciliation logic, manual `tt start`/`tt stop`/`tt status` commands.

**Features from FEATURES.md:**
- Session storage (SQLite, WAL mode, correct schema)
- Project inference from working directory with git root detection
- Manual `start`, `stop`, `status` commands
- Multi-terminal singleton via TT_TERMINAL_ID

**Pitfalls this phase must avoid:**
- SQLite locking (WAL + busy timeout from first open)
- Timezone corruption (UTC millis + IANA column in schema)
- Rate history corruption (`rate_at_time` column in schema)
- Double-counting (TT_TERMINAL_ID + singleton enforcement)
- Orphaned sessions (heartbeat column + reconciliation logic)

**Research flag:** Standard patterns — SQLite WAL mode, Drizzle schema definition, and Repository pattern are well-documented. No additional research needed.

---

### Phase 2: Claude Code Hook Integration

**Rationale:** The hook integration is the product's core differentiator, but it cannot be built before Phase 1 because hooks write to the database. Hook scripts must be thin shell wrappers; all logic lives in the TypeScript CLI. This phase is the highest-risk phase technically — reliability engineering for unreliable event sources.

**Delivers:** Shell hook scripts for SessionStart/Stop/PreToolUse/PostToolUse, `tt pulse` subcommand, PulseRepository, IdleDetector (two-tier soft/hard thresholds), startup reconciliation (auto-close stale sessions), rate-limited pulse writes (max 1 write per 60s per terminal+project), hook performance benchmarks.

**Features from FEATURES.md:**
- Claude Code hook integration (auto-detect sessions via lifecycle hooks)
- Idle detection with configurable thresholds (8-min soft, 20-min hard)
- Session reconciliation on startup

**Pitfalls this phase must avoid:**
- Unreliable Stop/SessionStart hooks (heartbeat model; hooks are hints only)
- Hook startup latency (shell scripts exec binary and exit; <100ms P99 enforced by tests)
- Idle detection false positives (two-tier thresholds; non-interactive; `tt undo idle` available)

**Research flag:** Needs deeper research during planning — Claude Code hook reliability behavior, rate-limiting strategy, and launchd plist for optional idle-check timer are niche and sparsely documented.

---

### Phase 3: Reports and Export

**Rationale:** Once automatic tracking is running, the user needs to see and export their data. This phase delivers the primary billing artifact. Depends on Phase 1 (schema and repositories) but is independent of Phase 2 (hooks can be absent and manual tracking still produces reportable data).

**Delivers:** ReportEngine with aggregation by project and date range, `tt week` and `tt projects` commands, CSV export, formatted terminal output (hours and minutes, never raw seconds), `tt export` command.

**Features from FEATURES.md:**
- Report: today's time and time per project with date range
- CSV export (data portability to ClickUp)
- List/history view
- Current session status with hook health indicator

**Pitfalls this phase must avoid:**
- Reporting raw seconds (always display as `Xh Ym`)
- Full table scan on large history (index on `(project_id, started_at)` must be in place)
- Silent hook failures (`tt status` must show last successful heartbeat)

**Research flag:** Standard patterns — SQL aggregation, CSV serialization, and terminal table formatting are well-documented. No additional research needed.

---

### Phase 4: Session Correction and Billing Features

**Rationale:** After using the tool for 2+ weeks, the user will encounter the real pain points: needing to correct session errors, split fragmented sessions, and see billable totals. This phase adds the correction ergonomics that make the tool trustworthy for billing. Requires stable Phase 1 repositories.

**Delivers:** Edit past entry (time, note, project), undo last operation (soft-delete / event log pattern), session split and merge commands, hourly rate per project with billable totals, session notes and tags.

**Features from FEATURES.md:**
- Edit past entries — corrections are mandatory for real use
- Undo last operation — missing from all competitors
- Session split/merge — ergonomic session correction
- Hourly rate per project + billable totals — direct billing insight

**Pitfalls this phase must avoid:**
- Hard deletes preventing undo (soft-delete must be the default from Phase 1)
- Merge/delete without confirmation (all destructive operations require preview or snapshot)
- Rate history corruption (already prevented in Phase 1 schema)

**Research flag:** Standard patterns for undo stacks and soft-delete are well-documented. Session split/merge semantics need careful design but no research.

---

### Phase 5: Git Context and TUI Dashboard

**Rationale:** Git context capture and the TUI dashboard are high-value enhancements that require the core tracking system to be proven accurate first. GitCapture is low complexity but only useful after billing workflow is established. The TUI dashboard requires ink and is the highest-effort single feature; it should not block earlier phases.

**Delivers:** GitCapture (branch/SHA at session boundaries), git metadata in session records, JSON export, TUI live dashboard with ink showing active timer and session summary.

**Features from FEATURES.md:**
- Git context capture (branch/SHA at session boundaries) — auto-populates "what did I work on?"
- JSON export — richer data than CSV for programmatic use
- Rich TUI dashboard with live timer

**Pitfalls this phase must avoid:**
- Running `git log` or `git diff` in hooks (use only `git rev-parse HEAD` and `git branch --show-current`)
- ink overhead for non-interactive commands (keep static output paths using consola + chalk)

**Research flag:** ink TUI composition patterns may benefit from brief research during planning — the React-in-terminal model has non-obvious layout quirks.

---

### Phase Ordering Rationale

- **Schema-first ordering:** Pitfalls research is unambiguous that timezone storage, rate history, and terminal singleton enforcement must be in the initial schema. This forces Phase 1 to be pure foundation work before any user-visible feature.
- **Hooks before reports:** Hook integration (Phase 2) must precede reports (Phase 3) because the value of reports is proportional to the accuracy of automatic tracking. Reports on manually-entered data alone don't validate the differentiator.
- **Reports before correction:** The user must see their data (Phase 3) before they know what needs correcting (Phase 4). Undo and edit workflows are motivated by real data, not by design.
- **TUI last:** The ink dashboard is the highest-effort single feature and the least critical. All earlier phases produce correct data via plain-text CLI output. The TUI is polish, not function.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (Hook Integration):** Claude Code hook reliability edge cases, rate-limiting pulse write strategy, launchd plist configuration for periodic idle-check, and macOS HIDIdleTime API usage are sparsely documented and niche. Recommend `/gsd:research-phase` before implementing.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** SQLite WAL mode, Drizzle schema, Repository pattern, and bun:sqlite configuration are all covered in official documentation.
- **Phase 3 (Reports):** SQL aggregation, CSV serialization, and terminal table formatting are standard patterns.
- **Phase 4 (Correction):** Soft-delete, undo stack, and CRUD edit patterns are standard.
- **Phase 5 (Git + TUI):** GitCapture uses two constant-time git commands. ink TUI may benefit from brief research but is not blocking.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack (Bun, bun:sqlite, drizzle-orm, luxon, ink) all verified against official docs; gunshi is MEDIUM (active development, minor API churn possible) |
| Features | HIGH | Table stakes verified against 4 production CLI trackers with official documentation; differentiators derived from project-specific analysis and competitor gaps |
| Architecture | HIGH | Heartbeat pattern verified against WakaTime official docs; stateless singleton verified against Timetrap and SQLite WAL docs; Repository pattern is standard |
| Pitfalls | HIGH | Stop/SessionStart hook failures have numbered GitHub issues with reproductions; SQLite locking behavior is technically verified; schema decisions are validated against Timewarrior corruption bugs |

**Overall confidence:** HIGH

### Gaps to Address

- **Daemon vs. inline architecture final decision:** Research recommends a background daemon (launchd plist) for hook performance, but the daemon-vs-stateless-inline tradeoff has implementation implications for Phase 1. The Architecture research presents both options. Decision should be made explicitly before Phase 1 implementation begins. Current recommendation: start stateless (inline); add daemon only if hook latency benchmarks show >100ms P99.

- **gunshi API stability:** gunshi is at ^0.27 with active development. API may shift between now and implementation. Verify current API surface against the GitHub repository before Phase 1 starts.

- **macOS HIDIdleTime access pattern in Bun:** Research confirms `ioreg -c IOHIDSystem` is the correct macOS idle detection mechanism, but the exact Bun subprocess integration pattern (synchronous shell invocation within an idle check) needs to be validated during Phase 2 implementation.

- **TT_TERMINAL_ID onboarding:** The multi-terminal singleton feature requires TT_TERMINAL_ID to be set per-terminal in shell profiles or Ghostty configuration. The research identifies this as a dependency but does not specify the exact onboarding mechanism. An `tt setup` command or install script that outputs the required shell profile additions should be designed during Phase 1.

## Sources

### Primary (HIGH confidence)
- Bun SQLite docs (bun.com/docs/runtime/sqlite) — bun:sqlite API, WAL mode, performance
- Drizzle ORM bun:sqlite guide (orm.drizzle.team) — setup, migration commands, schema
- ink GitHub (vadimdemedes/ink) — v6.8.0, React-based TUI, Bun compatibility
- WakaTime Plugin Architecture (wakatime.com/help/creating-plugin) — heartbeat pattern, rate-limiting
- Timetrap CLI (github.com/samg/timetrap) — session model, SQLite storage, formatter architecture
- SQLite WAL mode documentation (sqlite.org/wal.html) — WAL behavior, concurrent writes
- SQLite concurrent writes deep-dive (tenthousandmeters.com) — SQLITE_BUSY, WAL mode, BEGIN IMMEDIATE
- Watson documentation (jazzband.github.io/Watson/) — feature set, project+tag grouping
- Timewarrior documentation (timewarrior.net/docs/) — feature set, interval model
- Claude Code hooks reference (code.claude.com/docs/en/hooks) — hook types, lifecycle, constraints

### Secondary (MEDIUM confidence)
- gunshi GitHub (kazupon/gunshi) — v0.27 features, TypeScript argument typing
- My JS CLI Stack 2025 (ryoppippi.com) — gunshi, consola, vitest selection rationale
- timetrackcli (github.com/rezmoss/timetrackcli) — idle detection patterns, 30-day calendar view
- hours CLI (github.com/dhth/hours) — TUI patterns, Go bubbletea reference
- GTM git time metric (github.com/git-time-metric/gtm) — git-native tracking reference
- Bun CLI applications (oneuptime.com/blog) — single binary compilation, Bun CLI patterns
- Python CLI Time Tracker (dev.to/dmikhr) — three-layer architecture pattern

### Tertiary (referenced for pitfall verification)
- Claude Code issues #3113, #16047, #10373, #19225, #23359 — Stop/SessionStart hook failure reproductions
- Timewarrior database corruption issues #155, #605 — disk full corruption, data loss patterns
- Database timestamps and timezones (tinybird.co, jamesridgway.co.uk) — UTC + IANA zone storage rationale
- macOS idle time via HIDIdleTime (xs-labs.com) — ioreg -c IOHIDSystem pattern

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
