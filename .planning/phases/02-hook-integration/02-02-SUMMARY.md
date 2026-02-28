---
phase: 02-hook-integration
plan: 02
subsystem: session
tags: [idle-detection, cli, pulse, away, back, config]

requires:
  - phase: 02-hook-integration
    provides: pulse command, pausedAt column, session schema
provides:
  - IdleDetector pure computation module (computeIdleState, computeIdleDeduction)
  - Idle auto-pause/resume integrated into pulse flow
  - tt away / tt back CLI commands for intentional breaks
  - Enhanced tt now with idle state display
  - Configurable idle thresholds (softIdleMinutes, hardIdleMinutes)
affects: [03-reporting, 04-invoicing]

tech-stack:
  added: []
  patterns: [stateless-idle-detection, atomic-sql-increment, config-driven-thresholds]

key-files:
  created:
    - src/core/session/idle-detector.ts
    - src/cli/commands/away.ts
    - src/cli/commands/back.ts
  modified:
    - src/core/session/session-service.ts
    - src/core/session/types.ts
    - src/core/session/index.ts
    - src/db/repositories/session-repository.ts
    - src/config/types.ts
    - src/cli/index.ts
    - src/cli/format.ts
    - src/cli/commands/now.ts

key-decisions:
  - "Idle detection is pure stateless computation — no timers, no daemons, computed on-demand from pulse timestamps"
  - "resumeFromIdle uses atomic SQL increment (idle_deducted_ms = idle_deducted_ms + ?) to prevent race conditions"
  - "Paused symbol uses yellow color matching stopped symbol for visual consistency"

patterns-established:
  - "Pure computation modules: idle-detector.ts has zero I/O imports, fully unit-testable"
  - "Config-driven thresholds: idle config loaded from ~/.tt/config.json with Zod defaults"

requirements-completed: [IDLE-01, IDLE-02, IDLE-03, IDLE-04, IDLE-05]

duration: 4min
completed: 2026-02-28
---

# Phase 2 Plan 02: IdleDetector, Away/Back, Enhanced Now Summary

**Stateless idle detection with 8min/20min thresholds, tt away/back for intentional breaks, and idle-aware tt now display**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-28T06:43:32Z
- **Completed:** 2026-02-28T06:47:32Z
- **Tasks:** 5
- **Files modified:** 10

## Accomplishments
- Pure IdleDetector module computing active/soft-idle/hard-idle/paused states from timestamps
- Pulse flow auto-deducts idle time beyond 8min grace period when 20min hard-idle threshold hit
- tt away / tt back commands for declaring and resuming intentional breaks
- tt now shows idle duration, break status, and paused state inline
- Configurable idle thresholds via ~/.tt/config.json idle section

## Task Commits

Each task was committed atomically:

1. **Task 1: IdleDetector pure stateless computation** - `1d87143` (feat)
2. **Task 2: Idle thresholds in config** - `ea76005` (feat)
3. **Task 3: Integrate idle detection into pulse** - `ae93a2c` (feat)
4. **Task 4: tt away and tt back commands** - `524b15e` (feat)
5. **Task 5: Enhanced tt now with idle state display** - `843d71f` (feat)

## Files Created/Modified
- `src/core/session/idle-detector.ts` - Pure idle state computation (computeIdleState, computeIdleDeduction)
- `src/cli/commands/away.ts` - tt away CLI command for intentional breaks
- `src/cli/commands/back.ts` - tt back CLI command to resume after break
- `src/core/session/session-service.ts` - Added away(), back() methods and pulse idle reconciliation
- `src/core/session/types.ts` - Added AwayResult, BackResult, enhanced SessionNowResult with idle info
- `src/core/session/index.ts` - Re-exports for new types and idle-detector
- `src/db/repositories/session-repository.ts` - Added resumeFromIdle and setPausedAt methods
- `src/config/types.ts` - Added idle config section to Zod schema
- `src/cli/index.ts` - Registered away and back subcommands
- `src/cli/format.ts` - Added paused symbol with yellow color
- `src/cli/commands/now.ts` - Enhanced display with idle/paused states

## Decisions Made
- Idle detection is pure stateless computation -- no timers, no daemons, computed on-demand from pulse timestamps
- resumeFromIdle uses atomic SQL increment to prevent race conditions between concurrent terminal pulses
- Paused symbol uses yellow color matching stopped symbol for visual consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Idle detection fully operational, ready for Phase 3 reporting to include idle-adjusted durations
- away/back commands ready for hook integration in shell workflows
- Config system extensible for additional threshold tuning

## Self-Check: PASSED

All 3 created files verified on disk. All 5 task commit hashes verified in git log.

---
*Phase: 02-hook-integration*
*Completed: 2026-02-28*
