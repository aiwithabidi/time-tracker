---
phase: 04-session-correction
plan: 02
subsystem: session
tags: [split, merge, inquirer, undo, cli]

requires:
  - phase: 04-session-correction-01
    provides: edit/undo methods, resolveSessionByPrefix, buildSnapshot, undo repository
provides:
  - split command (tt split <id> <time>) with proportional idle allocation
  - merge command (tt merge <id1> <id2>) with adjacency validation and gap-as-idle
  - SplitPreview, SplitResult, MergePreview, MergeResult types
  - InvalidSplitTimeError, MergeValidationError error classes
  - reassignPulses and findBySessionId on pulse repository
affects: [05-polish]

tech-stack:
  added: ["@inquirer/prompts"]
  patterns: [internal-function-delegation, proportional-idle-split, immutable-snapshot]

key-files:
  created:
    - src/cli/commands/split.ts
    - src/cli/commands/merge.ts
  modified:
    - src/core/session/session-service.ts
    - src/core/session/types.ts
    - src/core/session/errors.ts
    - src/core/session/index.ts
    - src/db/repositories/pulse-repository.ts
    - src/cli/index.ts
    - src/cli/helpers.ts

key-decisions:
  - "Internal function delegation instead of this-binding for preview methods in object-literal service"
  - "Immutable snapshot creation with spread operator instead of mutation for UndoSnapshot.deletedSessionIds"

patterns-established:
  - "Preview-then-apply pattern: previewX() returns preview, X() applies atomically"
  - "Dynamic import of @inquirer/prompts only when interactive prompt needed"

requirements-completed: [CORR-03, CORR-04]

duration: 3min
completed: 2026-02-28
---

# Phase 4 Plan 02: Split and Merge Commands Summary

**Split and merge commands with proportional idle allocation, preview confirmation via @inquirer/prompts, and undo integration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T05:43:11Z
- **Completed:** 2026-02-28T05:45:46Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- tt split <id> <time> divides session with proportional idle allocation and pulse reassignment
- tt merge <id1> <id2> combines adjacent same-project sessions, absorbing gap as idle
- Both commands show preview before applying (--yes to skip), push undo snapshots
- Cross-project merge hard-rejected, gap > 60 min requires --force

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, errors, and repository methods** - `fddea62` (feat)
2. **Task 2: Split and merge service methods** - `00f40fa` (feat)
3. **Task 3: CLI commands with preview and confirmation** - `c64b37f` (feat)

## Files Created/Modified
- `src/cli/commands/split.ts` - Split CLI command with preview and confirmation
- `src/cli/commands/merge.ts` - Merge CLI command with preview, --force, and confirmation
- `src/core/session/session-service.ts` - previewSplit, split, previewMerge, merge methods
- `src/core/session/types.ts` - SplitPreview, SplitResult, MergePreview, MergeResult interfaces
- `src/core/session/errors.ts` - InvalidSplitTimeError, MergeValidationError classes
- `src/core/session/index.ts` - Re-exports for new types and errors
- `src/db/repositories/pulse-repository.ts` - reassignPulses and findBySessionId methods
- `src/cli/index.ts` - Registered split and merge commands
- `src/cli/helpers.ts` - Error handling for new error classes

## Decisions Made
- Used internal function delegation (previewSplitInternal, previewMergeInternal) instead of this-binding since service uses object-literal pattern
- Immutable snapshot creation via spread operator per coding style rules
- Dynamic import of @inquirer/prompts to avoid loading it when --yes flag is used

## Deviations from Plan

None - plan executed exactly as written (with the documented deviations from the prompt handled as specified).

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Session correction phase complete (edit, undo, split, merge all working)
- Ready for Phase 5 (Polish)

---
*Phase: 04-session-correction*
*Completed: 2026-02-28*
