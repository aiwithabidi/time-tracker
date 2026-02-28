# Roadmap: TimeTracker

## Overview

Five phases take TimeTracker from zero to a fully integrated CLI time tracker. Phase 1 lays the permanent data schema and core session lifecycle — every subsequent phase depends on these decisions being correct. Phase 2 adds the product's differentiator: automatic session detection via Claude Code hooks with heartbeat-driven idle management. Phase 3 delivers the primary billing artifact: reports and CSV export. Phase 4 adds the correction ergonomics that make the tool trustworthy for real billing. Phase 5 closes the loop by embedding status and control directly inside Claude Code as slash commands.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - SQLite schema, repository layer, project inference, and manual start/stop/status commands
- [x] **Phase 2: Hook Integration** - Claude Code lifecycle hooks, activity pulses, idle detection, and startup reconciliation
- [ ] **Phase 3: Reporting and Export** - Weekly and per-project reports, session history, billable totals, and CSV export
- [ ] **Phase 4: Session Correction** - Edit, undo, split, and merge commands for billing-safe session correction
- [ ] **Phase 5: Claude Code Slash Commands** - `/tt` slash commands that surface tracking status and control inside Claude Code

## Phase Details

### Phase 1: Foundation
**Goal**: Users can manually track time against projects with accurate, billing-safe data from the first session
**Depends on**: Nothing (first phase)
**Requirements**: FNDN-01, FNDN-02, FNDN-03, FNDN-04, FNDN-05, FNDN-06, FNDN-07, PROJ-01, PROJ-02, PROJ-03, PROJ-05, SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06, SESS-07
**Success Criteria** (what must be TRUE):
  1. User can run `tt start` in a project directory, and the session is automatically associated with the correct project inferred from git root
  2. User can run `tt stop` to end a session and `tt now` to see the current session's project, running duration, and today's total — all in human-readable format
  3. Opening a second terminal in the same project directory and running `tt start` attaches to the existing session rather than creating a duplicate (TT_TERMINAL_ID deduplication)
  4. User can add a note and a tag to the current session; both persist across process restarts
  5. The compiled `tt` binary starts in under 100ms on a cold run
**Plans**: Ready

Plans:
- [x] 01-01: Database schema, WAL mode, and Drizzle repository layer
- [x] 01-02: ProjectResolver, compiled binary, and CLI entry point (gunshi)
- [x] 01-03: Session commands — start, stop, now, note, tag with singleton enforcement

### Phase 2: Hook Integration
**Goal**: Time tracking starts and stops automatically as Claude Code sessions begin and end, with idle time correctly excluded
**Depends on**: Phase 1
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06, IDLE-01, IDLE-02, IDLE-03, IDLE-04, IDLE-05
**Success Criteria** (what must be TRUE):
  1. Opening a new Claude Code session in a project directory automatically starts or attaches to a tracking session — no `tt start` required
  2. Leaving a terminal idle for 20 minutes results in the session being auto-paused; time stops accumulating
  3. Resuming activity in a paused session resumes tracking automatically without any manual command
  4. Running `tt away` then `tt back` correctly records an intentional break with idle_deducted_ms populated in the database
  5. Hook scripts complete in under 100ms measured end-to-end
**Plans**: Ready

Plans:
- [x] 02-01: Shell hook scripts (SessionStart, Stop, PostToolUse), `tt pulse` subcommand, `tt setup` installer
- [x] 02-02: IdleDetector with soft/hard thresholds, `tt away`/`tt back`, idle integration in pulse flow

### Phase 3: Reporting and Export
**Goal**: Users can see exactly where their billable hours went and export the data for client invoicing
**Depends on**: Phase 1
**Requirements**: PROJ-04, REPT-01, REPT-02, REPT-03, REPT-04, REPT-05, REPT-06, EXPT-01, EXPT-02, EXPT-03
**Success Criteria** (what must be TRUE):
  1. Running `tt today` shows time broken down by project for the current day, displayed as "Xh Ym" with no raw seconds visible anywhere
  2. Running `tt week` shows the current week's sessions, and `tt week --billable` adds a dollar-amount column using each project's hourly rate
  3. Running `tt log` shows session history filterable by `--project` and `--from`/`--to` date flags
  4. Running `tt projects` shows all known projects with their this-week totals
  5. Running `tt export csv --project=x --from=DATE --to=DATE` produces a CSV file with project, date, start, end, duration, notes, and tags columns; `--dry-run` previews row count without writing
**Plans**: Ready

Plans:
- [ ] 03-01: ReportEngine with aggregation, `tt today`, `tt week`, `tt log`, `tt last`, `tt projects`
- [ ] 03-02: ExportService, `tt export csv` with dry-run, billable totals with `--billable` flag

### Phase 4: Session Correction
**Goal**: Users can fix any tracking error without fear of permanent data loss, making the data trustworthy for billing
**Depends on**: Phase 1
**Requirements**: CORR-01, CORR-02, CORR-03, CORR-04
**Success Criteria** (what must be TRUE):
  1. User can run `tt edit <id>` to change a past session's start time, end time, note, project, or tags, and the change is reflected immediately in `tt log`
  2. Running `tt undo` after any state-changing operation (start, stop, edit, split, merge) reverts the change; the previous state is fully restored
  3. User can run `tt split <id> <time>` to divide a session at a given time, producing two sessions whose combined duration equals the original
  4. User can run `tt merge <id1> <id2>` on two adjacent sessions to produce a single session spanning the same time range
**Plans**: TBD

Plans:
- [ ] 04-01: Edit and undo commands with soft-delete undo stack
- [ ] 04-02: Split and merge commands with preview confirmation

### Phase 5: Claude Code Slash Commands
**Goal**: Users can check tracking status and control sessions without leaving the Claude Code conversation
**Depends on**: Phase 1, Phase 3
**Requirements**: CLCD-01, CLCD-02, CLCD-03, CLCD-04, CLCD-05, CLCD-06, CLCD-07
**Success Criteria** (what must be TRUE):
  1. Typing `/tt` in a Claude Code conversation displays the current session's project, duration, and today's total inline in the conversation
  2. Typing `/tt:week` displays a formatted weekly report inline without leaving the editor
  3. Typing `/tt:note "description"` adds a note to the current session; the note appears in subsequent `tt log` output
  4. Typing `/tt:start` or `/tt:stop` starts or stops tracking with confirmation output visible in the conversation
  5. All slash commands invoke the compiled `tt` binary and return results formatted for the Claude Code conversation context
**Plans**: TBD

Plans:
- [ ] 05-01: Slash command definitions for `/tt`, `/tt:week`, `/tt:note`, `/tt:start`, `/tt:stop`, `/tt:projects`, `/tt:edit`

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-02-28 |
| 2. Hook Integration | 2/2 | Complete | 2026-02-28 |
| 3. Reporting and Export | 0/2 | Not started | - |
| 4. Session Correction | 0/2 | Not started | - |
| 5. Claude Code Slash Commands | 0/1 | Not started | - |
