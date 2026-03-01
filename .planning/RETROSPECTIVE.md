# Retrospective: TimeTracker

## Milestone: v1.0 — MVP

**Shipped:** 2026-02-28
**Phases:** 5 | **Plans:** 10 | **Commits:** 44 | **LOC:** 5,411 TypeScript
**Timeline:** ~10 hours (Feb 27 18:00 → Feb 28 03:48)

### What Was Built

- 6-table SQLite schema with WAL mode and repository layer
- 20 CLI commands with compiled Bun binary (<100ms startup)
- Automatic session detection via Claude Code lifecycle hooks
- Heartbeat-based idle detection (8min soft, 20min hard auto-pause)
- Reporting engine with today/week/log/last/projects commands
- CSV export with RFC 4180 compliance and billable totals
- Session correction suite (edit, undo, split, merge) with atomic snapshots
- 8 Claude Code slash commands for in-conversation control

### What Worked

- **Stateless architecture**: No daemon, no timers — idle detection computed on-demand from pulse timestamps. This eliminated an entire class of reliability issues.
- **Repository factory pattern**: Plain objects with factory functions kept the codebase immutable and testable throughout all 5 phases.
- **Phase ordering**: Foundation first, then hooks, then reporting, then correction — each phase cleanly built on the previous with no circular dependencies.
- **Programmatic schema**: CREATE TABLE IF NOT EXISTS eliminated migration friction; new users get a working DB on first run.
- **Fire-and-forget hooks**: Designing around unreliable Claude Code hooks (known issues #3113, #16047, etc.) by making SQLite the source of truth was the right call.

### What Was Inefficient

- **SUMMARY.md gaps**: Phases 1 and 2 have fewer summaries than plans — execution moved fast but documentation lagged.
- **Test environment mismatch**: vitest can't import bun:sqlite, so DB-touching tests don't run. Should have set up bun test or mocked the DB layer from Phase 1.
- **REQUIREMENTS.md not updated during execution**: 31 items stayed "Pending" until the milestone audit caught it. Traceability should update as phases complete.
- **PROJ CLI commands deferred**: Config-file-only project management works but adds friction. Should have been scoped tighter or included a basic CLI.

### Patterns Established

- Repository factory: `createXxxRepository(db)` returns plain object with typed methods
- Service factory: `createXxxService({ repos })` with dependency injection
- Soft delete: `isDeleted` column, all queries filter by default
- Undo snapshot: push before mutation, pop and restore on undo
- Preview-then-apply: `previewX()` returns preview, `X()` applies atomically
- Export pattern: data to stdout, messages to stderr
- Slash command skills: `!` shell execution blocks invoking compiled binary

### Key Lessons

1. **Design for hook unreliability from day one** — heartbeat-based lifecycle was the single best architectural decision
2. **Compiled binary performance matters** — 100ms budget for hooks forced clean, fast code paths
3. **gunshi lazy loading** — essential for keeping CLI startup fast with 20+ commands
4. **Immutable patterns pay off at scale** — no mutation bugs across 5,411 LOC and 5 phases
5. **Test infrastructure needs to match runtime** — vitest + bun:sqlite mismatch should have been caught in Phase 1

### Cost Observations

- Model mix: 100% Opus (all phases)
- Sessions: ~5 (one per major work session)
- Efficiency: 10 plans in ~0.75 hours of execution time; most time spent on Phase 4 (edit/undo complexity)

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 5 |
| Plans | 10 |
| Commits | 44 |
| LOC | 5,411 |
| Timeline | ~10h |
| Avg plan duration | ~5 min |
