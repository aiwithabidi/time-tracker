# Phase 4: Session Correction — Context

**Phase Goal:** Users can fix any tracking error without fear of permanent data loss, making the data trustworthy for billing

**Requirements:** CORR-01, CORR-02, CORR-03, CORR-04

**Success Criteria:**
1. User can run `tt edit <id>` to change a past session's start time, end time, note, project, or tags, and the change is reflected immediately in `tt log`
2. Running `tt undo` after any state-changing operation (start, stop, edit, split, merge) reverts the change; the previous state is fully restored
3. User can run `tt split <id> <time>` to divide a session at a given time, producing two sessions whose combined duration equals the original
4. User can run `tt merge <id1> <id2>` on two adjacent sessions to produce a single session spanning the same time range

**Depends on:** Phase 1 (Foundation)

**Plan Split (from Roadmap):**
- 04-01: Edit and undo commands with soft-delete undo stack
- 04-02: Split and merge commands with preview confirmation

## Key Decisions from Research

1. **Undo approach:** Snapshot-based undo table (not event sourcing). Single `undo_log` table with JSON snapshot of before-state. Single-level undo only.
2. **Short IDs:** First 6+ chars of UUID for session identification. Display 8 chars in `tt log`. LIKE prefix search in SQLite.
3. **Edit UX:** Flag-based (--start, --end, --project, --note, --tag, --untag). No interactive TUI.
4. **Split idle:** Proportional split of idle_deducted_ms by wall-clock duration ratio.
5. **Merge gap:** Gap between sessions absorbed as idle time. Gap > 60min requires --force.
6. **Merge projects:** Hard-reject cross-project merge. User must reassign first with `tt edit`.
7. **Confirmation:** @inquirer/prompts confirm for split/merge preview. --yes flag bypasses.
8. **Undo scope:** All state-changing commands (start, stop, edit, split, merge) push to undo log.

## Codebase Context

**Repository layer:** Factory function pattern in `src/db/repositories/session-repository.ts`. Missing: `findByPrefix`, `update`, `restore`. Need new `undo-repository.ts`.

**Service layer:** `createSessionService({ repos })` in `src/core/session/session-service.ts`. Add correction methods here or create separate service.

**CLI commands:** gunshi `define()` + `lazy()` in `src/cli/index.ts`. Positionals: `ctx.positionals[1]` for first user arg.

**Notes/Tags:** Separate tables (`session_notes`, `session_tags`), not on session row.

**Transactions:** `withTransaction<T>` available in `src/db/client.ts`. Also drizzle's `db.transaction()`.

**Session IDs not shown in tt log currently** — need to add short ID column.
