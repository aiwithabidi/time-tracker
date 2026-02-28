# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Effortless, accurate time tracking that works passively in the background
**Current focus:** Phase 2 — Hook Integration (IN PROGRESS)

## Current Position

Phase: 2 of 5 (Hook Integration) — IN PROGRESS
Plan: 2 of 2 in current phase
Status: Plan 02-02 complete — idle detection, away/back, enhanced now
Last activity: 2026-02-28 — Plan 02-02 executed (5 tasks, 5 commits)

Progress: [████░░░░░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: ~5 min
- Total execution time: ~0.32 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/3 | ~15 min | ~5 min |
| 02-hook-integration | 1/2 | ~4 min | ~4 min |

**Recent Trend:**
- Last 5 plans: 01-01 (3 min), 01-02 (3.5 min), 01-03 (6 min), 02-02 (4 min)
- Trend: Consistent

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 2, Plan 02]: Idle detection is pure stateless computation -- no timers, computed on-demand from pulse timestamps
- [Phase 2, Plan 02]: resumeFromIdle uses atomic SQL increment to prevent race conditions
- [Phase 2, Plan 02]: Paused symbol uses yellow color matching stopped symbol
- [Phase 1, Plan 03]: gunshi lazy() requires args metadata duplicated in registration for option parsing
- [Phase 1, Plan 03]: gunshi positionals[0] contains command name; positional args start at index 1
- [Phase 1, Plan 02]: Zod v4 .default({}) on objects requires explicit default values
- [Phase 1, Plan 01]: Programmatic CREATE TABLE IF NOT EXISTS instead of drizzle-kit migrations for zero-friction first use
- [Phase 1, Plan 01]: Repository factory functions (not classes) returning plain objects for immutability
- [Phase 1, Plan 01]: crypto.randomUUID() for all entity IDs (zero deps, built into Bun)
- [Pre-Phase 1]: Heartbeat-based session lifecycle — hooks are fire-and-forget hints; SQLite is source of truth
- [Pre-Phase 1]: Stateless architecture (no daemon); idle detection computed on-demand, not by running timer
- [Pre-Phase 1]: Bun + bun:sqlite + drizzle-orm + gunshi + luxon + vitest stack confirmed against current docs
- [Pre-Phase 1]: Do NOT use Temporal API (not implemented in Bun); use luxon ^3.7 instead
- [Pre-Phase 1]: Do NOT use Prisma (daemon adds 200ms+, violates <100ms hook constraint)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2]: gunshi ^0.27 is under active development — verify current API surface against GitHub before Phase 2 starts
- [Phase 2]: Claude Code Stop/SessionStart hooks are unreliable in production (issues #3113, #16047, #10373, #19225, #23359) — hook integration needs careful reliability design; plan `/gsd:research-phase` before Phase 2
- [Phase 1]: TT_TERMINAL_ID onboarding mechanism (shell profile additions) needs explicit design — an `tt setup` command or install script is needed but not yet specified

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 02-02-PLAN.md
Resume file: None
