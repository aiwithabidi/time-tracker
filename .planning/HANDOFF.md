# Handoff: TimeTracker v1.0 → v1.1

**Date:** 2026-02-28
**Context:** v1.0 milestone shipped and archived. Security + code review completed. This document captures all findings for the next session.

## Status

- v1.0 tagged and archived in `.planning/milestones/`
- Binary installed at `~/.tt/bin/tt`
- Claude Code hooks active (SessionStart, PostToolUse, Stop)
- PATH added to `~/.zshrc`
- Tracking is live and working (13 sessions captured)

## Critical Fixes (Do First)

### Security — CRITICAL/HIGH

| # | Issue | File | Fix |
|---|-------|------|-----|
| S1 | Shell injection — unquoted SESSION_ID used as filename in hooks | `src/cli/commands/setup.ts` (hook templates) | Sanitize: `tr -cd 'a-zA-Z0-9_-'` or `basename` |
| S2 | Path traversal — SESSION_ID in `~/.tt/terminals/$SESSION_ID` | `src/hooks/*.sh` | Same sanitization as S1 |
| S3 | Unsafe undo deserialization — `JSON.parse` cast as UndoSnapshot, no validation | `src/db/repositories/undo-repository.ts:35` | Validate with Zod schema before use |
| S4 | Race condition — pulse rate limit + session singleton not in transaction | `src/core/session/session-service.ts:542` | Wrap `pulse()` and `start()` in `withTransaction()` |

### Correctness — P0

| # | Issue | File | Fix |
|---|-------|------|-----|
| C1 | Timezone bug — `getStartOfToday()` uses `new Date()` instead of Luxon | `session-service.ts:49-52` | Use `DateTime.now().startOf('day').toMillis()` |
| C2 | Dead code — `findBySlug('')` in stop() | `session-service.ts:381` | Remove, add `findById()` to project repo |
| C3 | N+1 — `findAll().find()` called 5 times instead of `findById()` | `session-service.ts:383,397,433,663,811` | Add `findById(id)` to project-repository |
| C4 | Migration swallows ALL errors silently | `src/db/migrate.ts:121-127` | Only catch "already exists" errors |
| C5 | `resolveProject()` dead TTY branch | `src/services/project-resolver.ts:91-100` | Remove dead code |
| C6 | LIKE wildcards not escaped in session prefix search | `session-repository.ts:176` | Validate hex chars, escape `%` and `_` |

### Performance — P0

| # | Issue | File | Fix |
|---|-------|------|-----|
| P1 | Config read twice per pulse (filesystem I/O on hot path) | `session-service.ts:59-65` | Load config once at service creation |
| P2 | `git rev-parse` subprocess spawned every pulse | `project-resolver.ts:50` | Cache git root per cwd |

## Important Fixes (Do Soon)

### Security — MEDIUM

| # | Issue | Fix |
|---|-------|-----|
| S5 | DB and config created with default permissions (world-readable) | `chmod 700` on `~/.tt/`, `600` on db + config |
| S6 | No note content length limit | Cap at 10,000 chars |
| S7 | Git hash could be interpreted as flag | Add `--` separator in git commands |
| S8 | Silent pulse error swallowing | Log to `~/.tt/pulse-errors.log` |

### Code Quality — P1

| # | Issue | Fix |
|---|-------|-----|
| Q1 | `computeSessionDuration()` duplicated in 3 files | Extract to `src/core/shared/duration.ts` |
| Q2 | Active session resolution pattern duplicated 7 times | Extract `resolveActiveSession()` helper |
| Q3 | `session-service.ts` is 977 lines (limit: 800) | Split into pulse/lifecycle/edit services |
| Q4 | `handleCommandError` is a long instanceof chain | Use base `TimeTrackerError` class |
| Q5 | Zero test coverage on core logic (vitest + bun:sqlite incompatible) | Mock repos for vitest, use `bun test` for DB integration |
| Q6 | `withTransaction` signature accepts unused `db` param | Change to `fn: () => T` |
| Q7 | No `activity_pulses` index on `terminal_id` | Add compound index `(terminal_id, timestamp)` |

## Positive Findings (No Action Needed)

- All SQL queries parameterized via Drizzle ORM
- Tag validation with kebab-case regex
- Config validated with Zod on load
- CSV export has proper RFC 4180 escaping
- `withTransaction` uses `BEGIN IMMEDIATE` correctly
- Git commands use array spawn (no shell injection)
- No hardcoded secrets anywhere

## Suggested v1.1 Scope

Based on these reviews, a v1.1 milestone should focus on:

1. **Security hardening** — S1-S8 fixes
2. **Correctness fixes** — C1-C6
3. **Performance** — P1-P2 (pulse under 100ms budget)
4. **Code quality** — Q1-Q7 (split god-service, add tests)
5. **Usability** — `tt alias add` and `tt rate set` CLI commands

Run `/gsd:new-milestone` to start v1.1 planning.

---
*Generated: 2026-02-28 from security-reviewer and code-reviewer agents*
