# Roadmap: TimeTracker

## Milestones

- **v1.0 MVP** — Phases 1-5 (shipped 2026-02-28) | [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Hardening** — Phases 6-10 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-5) — SHIPPED 2026-02-28</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-02-28
- [x] Phase 2: Hook Integration (2/2 plans) — completed 2026-02-28
- [x] Phase 3: Reporting and Export (2/2 plans) — completed 2026-02-28
- [x] Phase 4: Session Correction (2/2 plans) — completed 2026-02-28
- [x] Phase 5: Claude Code Slash Commands (1/1 plan) — completed 2026-02-28

</details>

### v1.1 Hardening (Phases 6-10)

- [ ] **Phase 6: Security Hardening** — Fix all 8 security issues (S1-S8)
  - Hook script injection sanitization (S1, S2)
  - Undo deserialization validation with Zod (S3)
  - Transaction wrapping for pulse/session race condition (S4)
  - File permission hardening on ~/.tt/ directory (S5)
  - Note length limit (S6)
  - Git command flag injection prevention (S7)
  - Pulse error logging instead of silent swallowing (S8)
  - **Requirements:** SEC-01..08
  - **Depends on:** None (can start immediately)

- [ ] **Phase 7: Correctness and Performance** — Fix 6 correctness + 2 performance issues
  - Timezone bug in getStartOfToday() (C1)
  - Dead code removal: findBySlug('') in stop(), TTY branch in resolveProject() (C2, C5)
  - Add findById() to project repository, replace N+1 findAll().find() calls (C3)
  - Migration error handler scoping (C4)
  - LIKE wildcard escaping in session prefix search (C6)
  - Config caching at service creation (P1)
  - Git root caching per cwd (P2)
  - **Requirements:** COR-01..06, PERF-01..02
  - **Depends on:** None (can start immediately, parallel with Phase 6)

- [ ] **Phase 8: Code Quality and Refactoring** — Structural improvements
  - Extract shared duration utility (Q1)
  - Extract resolveActiveSession() helper (Q2)
  - Split session-service.ts (977 lines) into pulse-service, lifecycle-service, edit-service (Q3)
  - Refactor handleCommandError to use base TimeTrackerError class (Q4)
  - Simplify withTransaction signature (Q6)
  - Add compound index on activity_pulses(terminal_id, timestamp) (Q7)
  - **Requirements:** QUAL-01..06
  - **Depends on:** Phase 7 (correctness fixes change files that Phase 8 restructures)

- [ ] **Phase 9: Test Suite** — Unit and integration test coverage
  - Set up vitest with mocked repositories for unit tests
  - Set up bun test for DB integration tests
  - Session lifecycle tests (start, stop, pulse, idle)
  - Reporting engine tests (today, week, log)
  - Session correction tests (edit, undo, split, merge)
  - Target 80% coverage on core logic
  - **Requirements:** TEST-01..06
  - **Depends on:** Phase 8 (tests should cover the refactored service structure)

- [ ] **Phase 10: CLI Commands and Binary Rebuild** — Deferred v1.0 features + final build
  - `tt alias add <dir> <slug>` command
  - `tt rate set <project> <rate>` command
  - Rebuild compiled binary with all v1.1 changes
  - Update hook scripts with security fixes
  - **Requirements:** CLI-01..02, PROJ-02, PROJ-03
  - **Depends on:** Phase 6 (hook script fixes), Phase 8 (service structure)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-02-28 |
| 2. Hook Integration | v1.0 | 2/2 | Complete | 2026-02-28 |
| 3. Reporting and Export | v1.0 | 2/2 | Complete | 2026-02-28 |
| 4. Session Correction | v1.0 | 2/2 | Complete | 2026-02-28 |
| 5. Claude Code Slash Commands | v1.0 | 1/1 | Complete | 2026-02-28 |
| 6. Security Hardening | v1.1 | 0/? | Pending | — |
| 7. Correctness and Performance | v1.1 | 0/? | Pending | — |
| 8. Code Quality and Refactoring | v1.1 | 0/? | Pending | — |
| 9. Test Suite | v1.1 | 0/? | Pending | — |
| 10. CLI Commands and Binary Rebuild | v1.1 | 0/? | Pending | — |

## Execution Strategy

**Phases 6 + 7 can run in parallel** — they touch different files and fix independent issues.

**Phase 8 depends on 7** — correctness fixes change files that the refactoring restructures.

**Phase 9 depends on 8** — tests should cover the final refactored service structure.

**Phase 10 depends on 6 + 8** — CLI commands use refactored services, binary includes security-fixed hooks.

```
Phase 6 (Security) ────────────────────────────┐
                                                ├──→ Phase 10 (CLI + Build)
Phase 7 (Correctness) ──→ Phase 8 (Quality) ──→┤
                                                └──→ Phase 9 (Tests)
```
