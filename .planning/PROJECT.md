# TimeTracker

## What This Is

A CLI-first personal time tracking tool for freelance developers who use Claude Code. It automatically detects work sessions via Claude Code lifecycle hooks, infers which client project you're working on from the directory, and provides reporting with billable totals and CSV export. 20 CLI commands and 8 Claude Code slash commands provide full control from the terminal or within Claude Code conversations.

## Core Value

Effortless, accurate time tracking that works passively in the background — the developer never has to remember to start or stop a timer.

## Requirements

### Validated

- Auto-detect work sessions via Claude Code hooks (SessionStart, Stop, PostToolUse) — v1.0
- Infer project from working directory with config file override support — v1.0
- Singleton session per project with multi-terminal attach (TT_TERMINAL_ID dedup) — v1.0
- Hybrid tracking: auto-detect activity + manual start/stop/adjustments — v1.0
- Idle detection with configurable thresholds (soft ~8min, hard auto-pause ~20min) — v1.0
- Time per project reporting with date range filtering (today, week, log) — v1.0
- Session history with start/stop times, durations, and notes — v1.0
- Cost/value insights (hourly rate per project, billable totals via --billable) — v1.0
- Freeform session notes and tagging — v1.0
- 20 CLI commands: now, start, stop, edit, split, merge, note, tag, undo, week, today, log, last, projects, export, pulse, setup, away, back, review — v1.0
- Local SQLite database with WAL mode — v1.0
- CSV export for portability to ClickUp and other tools — v1.0
- Session correction (edit, undo, split, merge) with atomic undo snapshots — v1.0
- Claude Code slash commands (/tt, /tt:week, /tt:note, /tt:start, /tt:stop, /tt:projects, /tt:edit, /tt:review) — v1.0

### Validated (v1.1 Hardening) — Shipped 2026-02-28

- Security hardening — 8 fixes (injection, traversal, deserialization, race conditions, permissions, limits, logging) — v1.1
- Correctness fixes — timezone, N+1, dead code, migration errors, LIKE escaping — v1.1
- Performance — config cached at service creation, git root cached per cwd — v1.1
- Code quality — session-service split (977→45 lines facade), shared utilities, error hierarchy — v1.1
- Test suite — 177 tests (146 unit + 31 integration), 96% statement coverage — v1.1
- `tt alias add/list/remove` and `tt rate set/show` CLI commands — v1.1
- 22 CLI commands total (up from 20) — v1.1

### Backlog

- [ ] Activity pattern analytics (productive hours, focus time, idle ratios)
- [ ] Git context capture (branch, commit SHAs at session start/end)
- [ ] JSON export for programmatic use
- [ ] Direct ClickUp API push with idempotency
- [ ] Shell completions for all commands

### Out of Scope

- Web dashboard — CLI-first; rich TUI possible in future
- Browser activity tracking — too invasive, Claude Code hooks are sufficient
- Mobile app — CLI-first; view hours via ClickUp or spreadsheet export
- Team features — this is a personal tool
- Invoice generation — export CSV covers this need
- Cloud sync / remote backup — breaks offline-first contract; SQLite file is trivially copyable
- Pomodoro timer — orthogonal to billing

## Context

- v1.0 shipped with 5,411 LOC; v1.1 hardening shipped with 9,472 LOC (177 tests)
- Tech stack: Bun + bun:sqlite + drizzle-orm + gunshi + luxon + chalk + cli-table3 + zod
- Compiled binary (dist/tt) starts in <100ms
- Developer works in Ghostty terminal, 4-8 active client projects at any time
- Uses Claude Code extensively with dangerous permissions, multiple tabs/terminals per project
- Data flows to ClickUp for client billing via CSV export
- Hook scripts (SessionStart, PostToolUse, Stop) fire-and-forget; SQLite is source of truth

## Constraints

- **Runtime**: Bun (package manager and runtime)
- **Storage**: Local SQLite — must work offline, no external services required
- **Performance**: Hook scripts must execute fast (<100ms) to avoid slowing Claude Code
- **Portability**: Data format supports export to ClickUp (time entries API), CSV, and JSON
- **Platform**: macOS (Darwin), Ghostty terminal

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI-first, web later | Stay in the terminal workflow, minimize context switching | Good |
| Claude Code hooks for auto-detection | Deepest integration with existing workflow, zero manual effort | Good |
| Singleton session per project | Prevents double-counting across multiple terminals | Good |
| Auto-pause (not auto-stop) on idle | Preserves session continuity, resumes on next activity | Good |
| Soft delete only for sessions | Prevents accidental data loss, maintains audit trail | Good |
| Rate snapshot per session | Hourly rates change over time; historical calculations need rate at time of work | Good |
| Heartbeat-based lifecycle | Hooks are unreliable; SQLite pulse timestamps are source of truth | Good |
| Stateless idle detection | No daemon/timers; computed on-demand from pulse timestamps | Good |
| Programmatic schema creation | No migration commands needed; CREATE TABLE IF NOT EXISTS on first run | Good |
| Repository factory functions | Plain objects, not classes; immutable returns | Good |
| gunshi for CLI framework | Lazy loading, TypeScript-first, small bundle | Good |
| CSV to stdout, messages to stderr | Clean shell piping (`tt export csv > report.csv`) | Good |
| Split god-service into facade + 3 services | Keeps files under 800 lines, separation of concerns | Good |
| vitest (unit) + bun test (integration) | vitest can't import bun:sqlite; dual runner solves it | Good |
| Base TimeTrackerError class | Simplified error handling from 9-branch instanceof to single check | Good |

---
*Last updated: 2026-02-28 after v1.1 milestone shipped*
