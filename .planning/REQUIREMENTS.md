# Requirements: TimeTracker

**Defined:** 2026-02-27
**Core Value:** Effortless, accurate time tracking that works passively in the background

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FNDN-01**: Local SQLite database with WAL mode stores all session and pulse data
- [x] **FNDN-02**: Database schema includes UTC millisecond timestamps with IANA timezone column
- [x] **FNDN-03**: Database schema includes rate_at_time snapshot on each session
- [x] **FNDN-04**: Database schema includes terminal_id, source, idle_deducted_ms fields from day one
- [x] **FNDN-05**: All session deletes are soft-deletes (is_deleted flag) to support undo
- [x] **FNDN-06**: Activity pulses table stores heartbeats with timestamp and source type
- [x] **FNDN-07**: Compiled Bun binary (`bun build --compile`) for fast CLI startup

### Session Management

- [x] **SESS-01**: User can manually start a time tracking session with `tt start`
- [x] **SESS-02**: User can stop the current session with `tt stop`
- [x] **SESS-03**: User can see current session status with `tt now` (project, duration, today's total)
- [x] **SESS-04**: Only one active session exists per project at a time (singleton enforcement)
- [x] **SESS-05**: Multiple terminals in the same project directory attach to the same session (multi-terminal dedup via TT_TERMINAL_ID)
- [x] **SESS-06**: User can add a freeform note to the current session with `tt note "description"`
- [x] **SESS-07**: User can tag sessions with categories (billable, bug, feature, meeting, etc.)

### Auto-Detection

- [x] **AUTO-01**: Claude Code SessionStart hook automatically starts or attaches to a session
- [x] **AUTO-02**: Claude Code Stop hook fires a final pulse to mark session activity end
- [x] **AUTO-03**: Hook scripts execute in <100ms (thin shell wrappers calling compiled binary)
- [x] **AUTO-04**: Activity pulses are written on tool use events, rate-limited to 1 per 60s per terminal
- [x] **AUTO-05**: Sessions use heartbeat-based lifecycle (session is "open" while pulses are fresh, not dependent on Stop hook firing)
- [x] **AUTO-06**: Stale sessions are auto-closed on next SessionStart (startup reconciliation)

### Idle Detection

- [x] **IDLE-01**: Soft idle at ~8 minutes with no activity pulses (flagged internally)
- [x] **IDLE-02**: Hard auto-pause at ~20 minutes with no activity pulses
- [x] **IDLE-03**: Auto-resume on next activity pulse (no manual action needed)
- [x] **IDLE-04**: Idle time is tracked separately (idle_deducted_ms) for audit
- [x] **IDLE-05**: User can declare intentional break with `tt away` and resume with `tt back`

### Project Management

- [x] **PROJ-01**: Project is auto-inferred from working directory (git root detection)
- [~] **PROJ-02**: User can override project mapping via config file or `tt alias add <dir> <slug>` *(config file works; CLI command in v1.1)*
- [~] **PROJ-03**: User can set hourly rate per project *(via config file; CLI command in v1.1)*
- [x] **PROJ-04**: User can list all known projects with `tt projects` (showing this-week totals)
- [~] **PROJ-05**: Project config supports client name, display name, slug, rate, and currency *(schema complete; CLI management in v1.1)*

### Reporting

- [x] **REPT-01**: User can see today's time breakdown by project with `tt today`
- [x] **REPT-02**: User can see weekly time report with `tt week` (optionally filtered by project)
- [x] **REPT-03**: User can browse session history with `tt log` (filterable by project, date range)
- [x] **REPT-04**: User can see the last completed session with `tt last`
- [x] **REPT-05**: All time displays use human-readable format (Xh Ym), never raw seconds
- [x] **REPT-06**: User can see billable totals per project (hours x rate = dollar amount) with `tt week --billable`

### Export

- [x] **EXPT-01**: User can export sessions to CSV with `tt export csv --project=x --from=DATE --to=DATE`
- [x] **EXPT-02**: Export includes project, date, start time, end time, duration, notes, tags
- [x] **EXPT-03**: Export supports --dry-run to preview without writing file

### Session Correction

- [x] **CORR-01**: User can edit a past session's start/end time, note, project, or tags with `tt edit <id>`
- [x] **CORR-02**: User can undo the last state-changing operation with `tt undo`
- [x] **CORR-03**: User can split a session at a specific time with `tt split <id> <time>`
- [x] **CORR-04**: User can merge two adjacent sessions with `tt merge <id1> <id2>`

### Claude Code Integration

- [x] **CLCD-01**: `/tt` slash command shows current session status inline in Claude Code
- [x] **CLCD-02**: `/tt:week` slash command shows weekly report inline
- [x] **CLCD-03**: `/tt:note` slash command adds a note to the current session
- [x] **CLCD-04**: `/tt:start` and `/tt:stop` slash commands control tracking from inside Claude Code
- [x] **CLCD-05**: `/tt:projects` slash command lists projects with hours inline
- [x] **CLCD-06**: `/tt:edit` slash command enables session editing from inside Claude Code
- [x] **CLCD-07**: Slash commands invoke the `tt` CLI binary and present results formatted for the conversation

## v1.1 Requirements

Hardening milestone. Security fixes, correctness fixes, performance, code quality, test coverage, and deferred CLI commands.

### Security

- [ ] **SEC-01**: Hook scripts sanitize SESSION_ID to prevent shell injection (S1)
- [ ] **SEC-02**: Hook scripts sanitize SESSION_ID to prevent path traversal (S2)
- [ ] **SEC-03**: Undo snapshot deserialization validated with Zod schema (S3)
- [ ] **SEC-04**: Pulse rate limit and session singleton wrapped in transaction (S4)
- [ ] **SEC-05**: Database and config files created with restrictive permissions (700/600) (S5)
- [ ] **SEC-06**: Note content capped at 10,000 characters (S6)
- [ ] **SEC-07**: Git commands use `--` separator to prevent hash-as-flag injection (S7)
- [ ] **SEC-08**: Pulse errors logged to `~/.tt/pulse-errors.log` instead of silently swallowed (S8)

### Correctness

- [ ] **COR-01**: `getStartOfToday()` uses Luxon `DateTime.now().startOf('day')` instead of raw `new Date()` (C1)
- [ ] **COR-02**: Dead `findBySlug('')` call removed from stop(), replaced with `findById()` (C2)
- [ ] **COR-03**: N+1 `findAll().find()` calls replaced with `findById()` on project repository (C3)
- [ ] **COR-04**: Migration error handler only catches "already exists" errors, not all errors (C4)
- [ ] **COR-05**: Dead TTY branch removed from `resolveProject()` (C5)
- [ ] **COR-06**: LIKE wildcards escaped in session prefix search (C6)

### Performance

- [ ] **PERF-01**: Config loaded once at service creation, not on every pulse (P1)
- [ ] **PERF-02**: Git root cached per working directory, not spawned on every pulse (P2)

### Code Quality

- [ ] **QUAL-01**: `computeSessionDuration()` extracted to shared `duration.ts` utility (Q1)
- [ ] **QUAL-02**: Active session resolution pattern extracted to `resolveActiveSession()` helper (Q2)
- [ ] **QUAL-03**: `session-service.ts` split into focused services (pulse, lifecycle, edit) under 800 lines each (Q3)
- [ ] **QUAL-04**: `handleCommandError` refactored to use base `TimeTrackerError` class (Q4)
- [ ] **QUAL-05**: `withTransaction` signature simplified to `fn: () => T` (Q6)
- [ ] **QUAL-06**: Compound index added on `activity_pulses(terminal_id, timestamp)` (Q7)

### Testing

- [ ] **TEST-01**: Unit test infrastructure with vitest and mocked repositories
- [ ] **TEST-02**: Integration test infrastructure with `bun test` for DB layer
- [ ] **TEST-03**: Core session lifecycle tests (start, stop, pulse, idle detection)
- [ ] **TEST-04**: Reporting engine tests (today, week, log aggregation)
- [ ] **TEST-05**: Session correction tests (edit, undo, split, merge)
- [ ] **TEST-06**: 80% coverage on core logic (services, repositories)

### CLI Commands

- [ ] **CLI-01**: `tt alias add <dir> <slug>` command for project alias management (PROJ-02)
- [ ] **CLI-02**: `tt rate set <project> <rate>` command for hourly rate management (PROJ-03)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Analytics & Visualization

- **ANLZ-01**: Activity pattern analytics (productive hours, focus time, idle ratios)
- **ANLZ-02**: Rich TUI dashboard with ink (live timer, project breakdown, weekly chart)
- **ANLZ-03**: Web dashboard for deep analysis and visualization

### Git Integration

- **GIT-01**: Capture git branch and commit SHA at session start/end
- **GIT-02**: "What did I work on?" report using git context

### Advanced Export

- **EXPT-04**: JSON export for programmatic use
- **EXPT-05**: Direct ClickUp API push with idempotency (clickup_entry_id stored locally)
- **EXPT-06**: Aggregated daily summaries export (not just raw sessions)

### Quality of Life

- **QOL-01**: Natural language time parsing ("yesterday at 2pm", "5 minutes ago")
- **QOL-02**: Shell completions for all commands
- **QOL-03**: `tt setup` onboarding command that configures shell profile and hooks

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Pomodoro timer | Orthogonal to billing; use a dedicated Pomodoro app |
| Invoice generation | Formatting, tax, PDF — each is a product; export CSV instead |
| Browser/app activity tracking | Invasive, requires system permissions; Claude Code hooks are sufficient |
| Team/collaborative features | Personal tool; team use requires a different product |
| Cloud sync / remote backup | Breaks offline-first contract; SQLite file is trivially copyable |
| Real-time keystroke monitoring | Privacy concern; session-level tracking is sufficient |
| Mobile app | CLI-first; view hours via ClickUp or spreadsheet export |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

### v1.0 (Phases 1-5)

| Requirement | Phase | Status |
|-------------|-------|--------|
| FNDN-01..07 | Phase 1 | Complete |
| SESS-01..07 | Phase 1 | Complete |
| AUTO-01..06 | Phase 2 | Complete |
| IDLE-01..05 | Phase 2 | Complete |
| PROJ-01 | Phase 1 | Complete |
| PROJ-02 | Phase 1 | Partial (config only; CLI in v1.1 Phase 10) |
| PROJ-03 | Phase 1 | Partial (config only; CLI in v1.1 Phase 10) |
| PROJ-04 | Phase 3 | Complete |
| PROJ-05 | Phase 1 | Partial (schema only; CLI in v1.1 Phase 10) |
| REPT-01..06 | Phase 3 | Complete |
| EXPT-01..03 | Phase 3 | Complete |
| CORR-01..04 | Phase 4 | Complete |
| CLCD-01..07 | Phase 5 | Complete |

### v1.1 (Phases 6-10)

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01..02 | Phase 6 | Pending |
| SEC-03..04 | Phase 6 | Pending |
| SEC-05..08 | Phase 6 | Pending |
| COR-01..06 | Phase 7 | Pending |
| PERF-01..02 | Phase 7 | Pending |
| QUAL-01..06 | Phase 8 | Pending |
| TEST-01..06 | Phase 9 | Pending |
| CLI-01..02 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 50 total — 47 complete, 3 partial (completing in v1.1)
- v1.1 requirements: 22 total — 0 complete
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*v1.1 requirements added: 2026-02-28*
