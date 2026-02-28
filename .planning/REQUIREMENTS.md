# Requirements: TimeTracker

**Defined:** 2026-02-27
**Core Value:** Effortless, accurate time tracking that works passively in the background

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FNDN-01**: Local SQLite database with WAL mode stores all session and pulse data
- [ ] **FNDN-02**: Database schema includes UTC millisecond timestamps with IANA timezone column
- [ ] **FNDN-03**: Database schema includes rate_at_time snapshot on each session
- [ ] **FNDN-04**: Database schema includes terminal_id, source, idle_deducted_ms fields from day one
- [ ] **FNDN-05**: All session deletes are soft-deletes (is_deleted flag) to support undo
- [ ] **FNDN-06**: Activity pulses table stores heartbeats with timestamp and source type
- [ ] **FNDN-07**: Compiled Bun binary (`bun build --compile`) for fast CLI startup

### Session Management

- [ ] **SESS-01**: User can manually start a time tracking session with `tt start`
- [ ] **SESS-02**: User can stop the current session with `tt stop`
- [ ] **SESS-03**: User can see current session status with `tt now` (project, duration, today's total)
- [ ] **SESS-04**: Only one active session exists per project at a time (singleton enforcement)
- [ ] **SESS-05**: Multiple terminals in the same project directory attach to the same session (multi-terminal dedup via TT_TERMINAL_ID)
- [ ] **SESS-06**: User can add a freeform note to the current session with `tt note "description"`
- [ ] **SESS-07**: User can tag sessions with categories (billable, bug, feature, meeting, etc.)

### Auto-Detection

- [ ] **AUTO-01**: Claude Code SessionStart hook automatically starts or attaches to a session
- [ ] **AUTO-02**: Claude Code Stop hook fires a final pulse to mark session activity end
- [ ] **AUTO-03**: Hook scripts execute in <100ms (thin shell wrappers calling compiled binary)
- [ ] **AUTO-04**: Activity pulses are written on tool use events, rate-limited to 1 per 60s per terminal
- [ ] **AUTO-05**: Sessions use heartbeat-based lifecycle (session is "open" while pulses are fresh, not dependent on Stop hook firing)
- [ ] **AUTO-06**: Stale sessions are auto-closed on next SessionStart (startup reconciliation)

### Idle Detection

- [ ] **IDLE-01**: Soft idle at ~8 minutes with no activity pulses (flagged internally)
- [ ] **IDLE-02**: Hard auto-pause at ~20 minutes with no activity pulses
- [ ] **IDLE-03**: Auto-resume on next activity pulse (no manual action needed)
- [ ] **IDLE-04**: Idle time is tracked separately (idle_deducted_ms) for audit
- [ ] **IDLE-05**: User can declare intentional break with `tt away` and resume with `tt back`

### Project Management

- [ ] **PROJ-01**: Project is auto-inferred from working directory (git root detection)
- [ ] **PROJ-02**: User can override project mapping via config file or `tt alias add <dir> <slug>`
- [ ] **PROJ-03**: User can set hourly rate per project
- [ ] **PROJ-04**: User can list all known projects with `tt projects` (showing this-week totals)
- [ ] **PROJ-05**: Project config supports client name, display name, slug, rate, and currency

### Reporting

- [ ] **REPT-01**: User can see today's time breakdown by project with `tt today`
- [ ] **REPT-02**: User can see weekly time report with `tt week` (optionally filtered by project)
- [ ] **REPT-03**: User can browse session history with `tt log` (filterable by project, date range)
- [ ] **REPT-04**: User can see the last completed session with `tt last`
- [ ] **REPT-05**: All time displays use human-readable format (Xh Ym), never raw seconds
- [ ] **REPT-06**: User can see billable totals per project (hours x rate = dollar amount) with `tt week --billable`

### Export

- [ ] **EXPT-01**: User can export sessions to CSV with `tt export csv --project=x --from=DATE --to=DATE`
- [ ] **EXPT-02**: Export includes project, date, start time, end time, duration, notes, tags
- [ ] **EXPT-03**: Export supports --dry-run to preview without writing file

### Session Correction

- [ ] **CORR-01**: User can edit a past session's start/end time, note, project, or tags with `tt edit <id>`
- [ ] **CORR-02**: User can undo the last state-changing operation with `tt undo`
- [ ] **CORR-03**: User can split a session at a specific time with `tt split <id> <time>`
- [ ] **CORR-04**: User can merge two adjacent sessions with `tt merge <id1> <id2>`

### Claude Code Integration

- [ ] **CLCD-01**: `/tt` slash command shows current session status inline in Claude Code
- [ ] **CLCD-02**: `/tt:week` slash command shows weekly report inline
- [ ] **CLCD-03**: `/tt:note` slash command adds a note to the current session
- [ ] **CLCD-04**: `/tt:start` and `/tt:stop` slash commands control tracking from inside Claude Code
- [ ] **CLCD-05**: `/tt:projects` slash command lists projects with hours inline
- [ ] **CLCD-06**: `/tt:edit` slash command enables session editing from inside Claude Code
- [ ] **CLCD-07**: Slash commands invoke the `tt` CLI binary and present results formatted for the conversation

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

| Requirement | Phase | Status |
|-------------|-------|--------|
| FNDN-01 | — | Pending |
| FNDN-02 | — | Pending |
| FNDN-03 | — | Pending |
| FNDN-04 | — | Pending |
| FNDN-05 | — | Pending |
| FNDN-06 | — | Pending |
| FNDN-07 | — | Pending |
| SESS-01 | — | Pending |
| SESS-02 | — | Pending |
| SESS-03 | — | Pending |
| SESS-04 | — | Pending |
| SESS-05 | — | Pending |
| SESS-06 | — | Pending |
| SESS-07 | — | Pending |
| AUTO-01 | — | Pending |
| AUTO-02 | — | Pending |
| AUTO-03 | — | Pending |
| AUTO-04 | — | Pending |
| AUTO-05 | — | Pending |
| AUTO-06 | — | Pending |
| IDLE-01 | — | Pending |
| IDLE-02 | — | Pending |
| IDLE-03 | — | Pending |
| IDLE-04 | — | Pending |
| IDLE-05 | — | Pending |
| PROJ-01 | — | Pending |
| PROJ-02 | — | Pending |
| PROJ-03 | — | Pending |
| PROJ-04 | — | Pending |
| PROJ-05 | — | Pending |
| REPT-01 | — | Pending |
| REPT-02 | — | Pending |
| REPT-03 | — | Pending |
| REPT-04 | — | Pending |
| REPT-05 | — | Pending |
| REPT-06 | — | Pending |
| EXPT-01 | — | Pending |
| EXPT-02 | — | Pending |
| EXPT-03 | — | Pending |
| CORR-01 | — | Pending |
| CORR-02 | — | Pending |
| CORR-03 | — | Pending |
| CORR-04 | — | Pending |
| CLCD-01 | — | Pending |
| CLCD-02 | — | Pending |
| CLCD-03 | — | Pending |
| CLCD-04 | — | Pending |
| CLCD-05 | — | Pending |
| CLCD-06 | — | Pending |
| CLCD-07 | — | Pending |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 0
- Unmapped: 43

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after initial definition*
