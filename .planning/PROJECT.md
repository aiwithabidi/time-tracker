# TimeTracker

## What This Is

A CLI-first personal time tracking tool for freelance developers who use Claude Code. It automatically detects work sessions via Claude Code lifecycle hooks, infers which client project you're working on from the directory, and provides rich analytics — time per project, session history, activity patterns, and cost/value insights. Designed to run entirely in the terminal, with a web dashboard planned for a future milestone.

## Core Value

Effortless, accurate time tracking that works passively in the background — the developer never has to remember to start or stop a timer.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Auto-detect work sessions via Claude Code hooks (SessionStart, Stop, lifecycle events)
- [ ] Infer project from working directory with override support
- [ ] Singleton session per project with multi-terminal attach (prevent double-counting)
- [ ] Hybrid tracking: auto-detect activity + manual start/stop/adjustments
- [ ] Idle detection with configurable thresholds (soft idle ~8min, hard auto-pause ~20min)
- [ ] CLI dashboard for stats, session history, and project summaries
- [ ] Time per project reporting with date range filtering
- [ ] Session history with start/stop times, durations, and notes
- [ ] Activity patterns (productive hours, idle gaps, focus time analysis)
- [ ] Cost/value insights (hourly rate per project, billable totals)
- [ ] Git context capture (branch, commit SHAs at session start/end)
- [ ] Freeform session notes and tagging
- [ ] Essential CLI commands: now, start, stop, status, edit, split, merge, note, undo, week, projects
- [ ] Local database for storage and analytics
- [ ] Project configuration via config file or CLI aliases
- [ ] Export capability (CSV/JSON) for portability to ClickUp and other tools

### Out of Scope

- Web dashboard — future milestone, not v1
- Browser activity tracking — too invasive, not needed for MVP
- Mobile app — CLI-first
- Direct ClickUp API integration — v1 exports data, manual import for now
- Team features — this is a personal tool
- Invoice generation — export data covers this need for now

## Context

- Developer works in Ghostty terminal, 4-8 active client projects at any time
- Uses Claude Code extensively with dangerous permissions, multiple tabs/terminals per project
- Breaks are inconsistent: sometimes terminals stay open, sometimes closed
- Currently has no time tracking — bills clients manually from memory
- Claude Code hooks (PreToolUse, PostToolUse, SessionStart, Stop) provide lifecycle events for auto-detection
- Each Ghostty tab/terminal needs a unique identifier (`TT_TERMINAL_ID` env var) to handle multi-terminal deduplication
- Claude Code provides `CLAUDE_SESSION_ID` for correlating Claude-specific activity
- Data will eventually flow to ClickUp for client billing, so schema must support export mapping
- User prefers modern, verified-latest-version tooling — all framework/library choices must be validated against current docs, not training data

## Constraints

- **Runtime**: Bun (user's preferred package manager and runtime)
- **Storage**: Local database — must work offline, no external services required
- **Performance**: Hook scripts must execute fast (<100ms) to avoid slowing Claude Code startup/shutdown
- **Portability**: Data format must support future export to ClickUp (time entries API), CSV, and JSON
- **Platform**: macOS (Darwin), Ghostty terminal

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI-first, web later | Stay in the terminal workflow, minimize context switching | — Pending |
| Claude Code hooks for auto-detection | Deepest integration with existing workflow, zero manual effort | — Pending |
| Singleton session per project | Prevents double-counting across multiple terminals | — Pending |
| Auto-pause (not auto-stop) on idle | Preserves session continuity, resumes on next activity | — Pending |
| Soft delete only for sessions | Prevents accidental data loss, maintains audit trail | — Pending |
| Store git context from session start | Enables "what did I work on" reporting without retrofitting | — Pending |
| Rate snapshot per session | Hourly rates change over time; historical calculations need the rate at time of work | — Pending |

---
*Last updated: 2026-02-27 after initialization*
