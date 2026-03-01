# Milestones: TimeTracker

## v1.0 MVP — Shipped 2026-02-28

**Phases:** 5 | **Plans:** 10 | **Commits:** 44 | **LOC:** 5,411 TypeScript

### Delivered

CLI-first personal time tracker with automatic Claude Code integration, idle detection, reporting, session correction, and slash commands.

### Key Accomplishments

1. 6-table SQLite schema with WAL mode, repository layer, and compiled Bun binary (<100ms startup)
2. Automatic session detection via Claude Code lifecycle hooks with heartbeat-based idle management
3. Five reporting commands (today, week, log, last, projects) with billable totals and CSV export
4. Session correction suite (edit, undo, split, merge) with atomic undo snapshots
5. 8 Claude Code slash commands for in-conversation time tracking control

### Known Gaps

- PROJ-02: `tt alias add` CLI command deferred (config file works)
- PROJ-03: `tt rate set` CLI command deferred (config file works)
- PROJ-05: Project config CLI management deferred (schema complete)

### Archive

- [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)
