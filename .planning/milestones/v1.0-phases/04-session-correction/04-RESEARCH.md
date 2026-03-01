# Phase 4: Session Correction - Research

**Researched:** 2026-02-28
**Domain:** SQLite undo stacks, CLI edit UX, session arithmetic (split/merge)
**Confidence:** HIGH

---

## Summary

Phase 4 adds four correction commands (`edit`, `undo`, `split`, `merge`) that allow users to fix tracking errors without permanent data loss. The project already has soft-delete (`is_deleted` flag) and `drizzle-orm` transactions — both are the correct foundation to build on.

The key design question is how to implement `tt undo`. Full event sourcing is overkill for a single-user CLI; the right approach is a **snapshot-based undo table** where each state-changing operation serialises the "before" state of all touched rows as JSON and appends a single row to an `undo_log` table. `tt undo` reads the most recent row, deserialises the snapshot, and restores it inside a transaction, then hard-deletes that row from the log. This gives one-level undo, matches the requirement (`tt undo` = undo the **last** operation), and requires no triggers.

Split and merge are purely arithmetic operations on the session row and its associated child rows (`session_notes`, `session_tags`, `activity_pulses`). Both should preview what will happen before committing, implemented with a `--yes`/`-y` flag to bypass confirmation and a printed diff when running interactively.

**Primary recommendation:** Snapshot-based undo table + inline flag editing + `--yes` bypass for split/merge preview.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORR-01 | Edit a past session's start/end time, note, project, or tags with `tt edit <id>` | Short-ID resolver + flag-based edits + Drizzle update pattern |
| CORR-02 | Undo the last state-changing operation with `tt undo` | Snapshot-based undo_log table, single-level undo |
| CORR-03 | Split a session at a specific time with `tt split <id> <time>` | Session arithmetic + proportional idle_deducted_ms + Drizzle transaction |
| CORR-04 | Merge two adjacent sessions with `tt merge <id1> <id2>` | Adjacency validation + idle accumulation + Drizzle transaction |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 (already installed) | All DB reads/writes | Already in use; `db.transaction()` wraps multi-row operations atomically |
| luxon | ^3.7.2 (already installed) | Parse time argument in `tt split <id> <time>` | Already used throughout codebase for date parsing |
| zod | ^4.3.6 (already installed) | Validate parsed edit flag values | Already in use for input validation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @inquirer/prompts | ^7.x (add as dep) | Confirm prompt for `tt split` and `tt merge` preview | Only needed when `--yes` flag is absent and stdout is a TTY |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @inquirer/prompts confirm | readline built-in | readline requires manual TTY handling; @inquirer handles raw mode and piped stdin cleanly |
| snapshot undo table | UNDOLOG triggers (SQLite official pattern) | Trigger approach records every row mutation automatically but adds schema complexity, requires DDL; snapshot approach is simpler, matches the one-level-undo requirement, and stays in application code |
| snapshot undo table | Full event sourcing | Event sourcing replayability is not needed here; single-user CLI only ever needs undo-last, not arbitrary history |

**Installation:**
```bash
bun add @inquirer/prompts
```

---

## Architecture Patterns

### Recommended Project Structure

New files this phase adds:

```
src/
├── db/
│   ├── schema.ts                    # ADD: undoLog table definition
│   ├── migrate.ts                   # ADD: CREATE TABLE undo_log migration
│   └── repositories/
│       ├── session-repository.ts    # EXTEND: findByPrefix, update, findAdjacent
│       └── undo-repository.ts       # NEW: push/pop undo log entries
├── core/
│   └── session/
│       ├── session-service.ts       # EXTEND: edit, undo, split, merge methods
│       └── types.ts                 # EXTEND: EditResult, UndoResult, SplitResult, MergeResult
└── cli/
    └── commands/
        ├── edit.ts                  # NEW
        ├── undo.ts                  # NEW
        ├── split.ts                 # NEW
        └── merge.ts                 # NEW
```

### Pattern 1: Short-ID Resolution

Sessions are addressed by the first 8 characters of their UUID in all four commands. The session-repository gains a `findByPrefix` method.

```typescript
// Source: existing codebase pattern (drizzle-orm bun-sqlite, sql template literal)
import { sql } from 'drizzle-orm'

findByPrefix(prefix: string): Session | undefined {
  // LIKE 'abc123%' is O(n) but the table is small; no index needed
  return db
    .select()
    .from(sessions)
    .where(
      and(
        sql`${sessions.id} LIKE ${prefix + '%'}`,
        eq(sessions.isDeleted, false),
      ),
    )
    .all()
    .then(rows => {
      if (rows.length === 0) throw new SessionNotFoundError(prefix)
      if (rows.length > 1) throw new AmbiguousIdError(prefix, rows.map(r => r.id.slice(0, 8)))
      return rows[0]
    })
}
```

Resolution rules:
- Prefix must be at least 6 characters (reject shorter to avoid accidental mass matches)
- If 0 matches: `SessionNotFoundError` with message "No session matches 'abc123'"
- If 2+ matches: `AmbiguousIdError` listing the conflicting short IDs and prompting user to use more characters

**Confidence:** HIGH — this is how git, docker, and similar tools handle short IDs. LIKE prefix search is standard SQLite.

### Pattern 2: Snapshot-Based Undo Log

**Schema addition:**
```sql
-- Added to migrate.ts MIGRATIONS_SQL array
CREATE TABLE IF NOT EXISTS undo_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  operation  TEXT NOT NULL,  -- 'edit' | 'split' | 'merge' | 'start' | 'stop'
  snapshot   TEXT NOT NULL,  -- JSON: { sessions, notes, tags } before-state
  created_at INTEGER NOT NULL
);
```

**Drizzle schema addition (schema.ts):**
```typescript
// Source: drizzle-orm sqlite-core docs
export const undoLog = sqliteTable('undo_log', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  operation: text('operation').notNull(),
  snapshot: text('snapshot').notNull(),  // JSON string
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})
```

**Snapshot shape (TypeScript type):**
```typescript
interface UndoSnapshot {
  sessions: Session[]          // all session rows affected (before state)
  notes: SessionNote[]         // notes belonging to those sessions (before state)
  tags: SessionTag[]           // tags belonging to those sessions (before state)
  deletedSessionIds?: string[] // session IDs to hard-delete on undo (for split)
}
```

**Push on every state-changing command:**
```typescript
// Inside createUndoRepository(db)
function push(operation: string, snapshot: UndoSnapshot): void {
  const now = Date.now()
  db.insert(undoLog)
    .values({ operation, snapshot: JSON.stringify(snapshot), createdAt: now })
    .run()
  // Trim log to last 20 entries to prevent unbounded growth
  db.run(sql`
    DELETE FROM undo_log
    WHERE id NOT IN (SELECT id FROM undo_log ORDER BY id DESC LIMIT 20)
  `)
}

function pop(): { operation: string; snapshot: UndoSnapshot } | undefined {
  const row = db.select().from(undoLog).orderBy(desc(undoLog.id)).limit(1).get()
  if (!row) return undefined
  db.delete(undoLog).where(eq(undoLog.id, row.id)).run()
  return { operation: row.operation, snapshot: JSON.parse(row.snapshot) as UndoSnapshot }
}
```

**Undo restore logic:**
```typescript
// Inside session-service.ts undo() method, using db.transaction()
const entry = repos.undo.pop()
if (!entry) throw new NothingToUndoError()

db.transaction(() => {
  for (const session of entry.snapshot.sessions) {
    // Upsert — restores soft-deleted rows AND field-level changes
    db.insert(sessions).values(session).onConflictDoUpdate({
      target: sessions.id,
      set: { ...session, updatedAt: Date.now() },
    }).run()
  }
  // Restore notes: delete current notes for these sessions, re-insert snapshot notes
  for (const session of entry.snapshot.sessions) {
    db.delete(sessionNotes).where(eq(sessionNotes.sessionId, session.id)).run()
  }
  for (const note of entry.snapshot.notes) {
    db.insert(sessionNotes).values(note).run()
  }
  // Restore tags: same pattern
  for (const session of entry.snapshot.sessions) {
    db.delete(sessionTags).where(eq(sessionTags.sessionId, session.id)).run()
  }
  for (const tag of entry.snapshot.tags) {
    db.insert(sessionTags).values(tag).run()
  }
  // Hard-delete sessions that were created by the undone operation (e.g. split products)
  for (const id of entry.snapshot.deletedSessionIds ?? []) {
    db.delete(sessions).where(eq(sessions.id, id)).run()
  }
})
```

**Confidence:** HIGH — snapshot approach is well-established for single-user undo in SQLite applications (Xojo Forum, SQLite community patterns, Undo/Redo With SQLite documentation).

### Pattern 3: `tt edit <id>` — Flag-Based Edit

No interactive TUI. Use flags for each editable field, matching the project's existing `--flag value` CLI style.

```
tt edit abc12345 --start "09:00" --end "10:30" --project my-project --note "Add note" --tag billable --untag old-tag
```

Flag spec:
| Flag | Type | Description |
|------|------|-------------|
| `--start` | string | New start time (parsed by luxon, same formats as `tt log --from`) |
| `--end` | string | New end time (parsed by luxon) |
| `--project` | string | Reassign to different project slug |
| `--note` | string | Append a new note (does not replace existing) |
| `--tag` | string | Add a tag |
| `--untag` | string | Remove a tag |

At least one flag must be present; if none, print usage error and exit 1.

Before applying: snapshot the session + its notes + its tags into undo_log. Apply all flag changes inside a `db.transaction()`. Print a before/after diff.

**Time parsing for `--start`/`--end`:** Extend `parseDateFlag` from `date-parsing.ts` OR use luxon's `DateTime.fromFormat` for time-only input like "09:00" relative to the session's existing date:

```typescript
// Source: luxon docs - DateTime.fromISO handles "2026-02-28T09:00" directly
// For time-only input "09:00", combine with session's existing date:
function parseEditTime(input: string, sessionDate: DateTime): DateTime {
  // If ISO datetime — use directly
  const full = DateTime.fromISO(input)
  if (full.isValid) return full

  // If time-only HH:mm — apply to session's calendar date
  const timeOnly = DateTime.fromFormat(input, 'HH:mm')
  if (timeOnly.isValid) {
    return sessionDate.set({ hour: timeOnly.hour, minute: timeOnly.minute, second: 0, millisecond: 0 })
  }

  throw new Error(`Cannot parse time "${input}". Use HH:mm or ISO 8601 (YYYY-MM-DDTHH:mm).`)
}
```

**Confidence:** HIGH — luxon `DateTime.fromISO` and `DateTime.fromFormat` are well-documented; this codebase already uses luxon.

### Pattern 4: `tt split <id> <time>` — Session Splitting

**idle_deducted_ms allocation rule:** Proportional split by wall-clock duration.

```
original: start=09:00, end=11:00, idle_deducted_ms=600_000 (10 min)
split at: 10:00

session A: 09:00–10:00 = 3600s wall clock = 50% of total 7200s
session B: 10:00–11:00 = 3600s wall clock = 50% of total 7200s

A.idle_deducted_ms = round(600_000 * (3600 / 7200)) = 300_000
B.idle_deducted_ms = round(600_000 * (3600 / 7200)) = 300_000
```

If the split time falls within an idle period (i.e. split point is inside a gap where no pulses exist), warn the user but still proceed — the proportional formula remains valid for billing purposes.

**Notes/Tags:** Copy all notes and tags from the original session to BOTH produced sessions. The user can then edit individual sessions to clean up if needed.

**activity_pulses:** Split pulses by timestamp — pulses before the split time go to session A, at-or-after go to session B.

**Drizzle transaction:**
```typescript
// Source: Drizzle ORM transactions docs — https://orm.drizzle.team/docs/transactions
db.transaction(() => {
  // 1. Snapshot original (before state) to undo_log
  repos.undo.push('split', { sessions: [original], notes, tags })

  // 2. Soft-delete original
  repos.sessions.softDelete(original.id)

  // 3. Create session A (original.start → splitTime)
  const sessionA = repos.sessions.create({ ...original, id: newIdA, endTime: splitMs, idleDeductedMs: idleA })

  // 4. Create session B (splitTime → original.end)
  const sessionB = repos.sessions.create({ ...original, id: newIdB, startTime: splitMs, idleDeductedMs: idleB })

  // 5. Copy notes + tags to both
  // 6. Re-assign pulses
})
```

The undo snapshot's `deletedSessionIds` includes `[sessionA.id, sessionB.id]` so that `tt undo` can hard-delete the new sessions when restoring the original.

**Preview output (before committing):**
```
Split preview:
  Session A  09:00 – 10:00  1h 0m
  Session B  10:00 – 11:00  1h 0m  (was 2h 0m total, 10m idle split proportionally)

Run with --yes to apply.
```

**Confidence:** HIGH — proportional idle split is the correct arithmetically-sound approach; no external library needed.

### Pattern 5: `tt merge <id1> <id2>` — Session Merging

**Adjacency validation:**
- Sessions must be completed (both have `endTime`)
- Sessions must belong to the same project (reject otherwise with a clear error; user can re-assign with `tt edit` first)
- The earlier session's `endTime` must be within a configurable gap of the later session's `startTime` (default: 60 minutes). Gap larger than that requires `--force`.
- Sessions must not both be active

**Merge result fields:**
```
merged.startTime   = earlier.startTime
merged.endTime     = later.endTime
merged.idleDeductedMs = earlier.idleDeductedMs + later.idleDeductedMs + gapMs
  where gapMs = later.startTime - earlier.endTime
merged.rateAtTime  = earlier.rateAtTime  (preserve billing rate of first session)
merged.source      = 'merged'
merged.notes       = concat(earlier.notes, later.notes)
merged.tags        = union(earlier.tags, later.tags)
```

The gap between sessions is treated as idle time added to `idleDeductedMs` of the merged session. This preserves the invariant:

```
billable_duration = endTime - startTime - idleDeductedMs
```

**Confidence:** HIGH — this is the minimal correct formula to preserve billing accuracy.

### Anti-Patterns to Avoid

- **Don't build an event log with replay.** Full event sourcing for a CLI undo operation adds > 200 lines of infrastructure for zero user-facing benefit. One-level undo via snapshot is simpler and correct.
- **Don't prompt interactively for edit fields.** The project uses flag-based CLI throughout. An interactive TUI would require ink or blessed; overkill for `tt edit`.
- **Don't hard-delete original sessions in split/merge without snapshotting first.** Always push to undo_log before any destructive write.
- **Don't apply partial edits outside a transaction.** All field changes in `tt edit` must be a single atomic `db.transaction()` call.
- **Don't let `idle_deducted_ms` go negative.** After splitting, assert `idleA >= 0` and `idleB >= 0`; cap at zero if floating-point arithmetic produces a tiny negative.
- **Don't merge active sessions.** Reject with an error if either session has `endTime IS NULL`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirm prompt (split/merge) | Custom readline loop | `@inquirer/prompts` confirm | Handles TTY detection, raw mode, piped stdin, and Windows correctly |
| Time parsing | Custom regex parser | luxon `DateTime.fromISO` + `DateTime.fromFormat` | Already in codebase; handles timezones, DST, and validation |
| Atomic multi-row writes | Manual BEGIN/COMMIT SQL strings | `db.transaction()` from drizzle-orm | Already available; handles rollback on throw automatically |
| Input schema validation | Manual if/else guards | zod schemas | Already a dependency; use for validating edit flag combinations |

**Key insight:** The undo stack, split arithmetic, and merge logic are all 20-50 line pure functions. Don't reach for libraries. The only new runtime dependency justified is `@inquirer/prompts` for the confirm prompt.

---

## Common Pitfalls

### Pitfall 1: Undo Snapshot Contains Stale Child Row References

**What goes wrong:** Snapshot serialises notes and tags at the moment of the edit, but between snapshot time and undo time the user may have run another operation that modified unrelated notes. On undo, the code deletes ALL current notes for the session before re-inserting the snapshot notes — accidentally deleting notes added after the edit.

**Why it happens:** Snapshot restore is a "replace all children" operation.

**How to avoid:** The undo log is single-level. `tt undo` can only undo the most recent operation. The session's notes/tags at undo time are exactly what was there when the operation was committed + any changes from subsequent operations. Since we only undo the last operation, this is safe: the "before" snapshot correctly represents the state before that operation. Users cannot stack multiple undos, so this edge case does not occur.

**Warning signs:** If a user reports `tt undo` deleting a note they added after an edit, it means they are calling `tt undo` after further changes, which is undefined behaviour for single-level undo. Document this limitation clearly in command output.

### Pitfall 2: Split Time Outside Session Bounds

**What goes wrong:** User provides `tt split abc12345 23:59` but the session ended at 17:00.

**How to avoid:** Validate in the service layer before touching the undo log:
```typescript
if (splitMs <= original.startTime || splitMs >= original.endTime!) {
  throw new InvalidSplitTimeError(splitMs, original.startTime, original.endTime!)
}
```

**Warning signs:** `endTime IS NULL` — reject splits of active sessions with a clear error.

### Pitfall 3: Merge Gap Larger Than Expected Adds Unexpected Idle

**What goes wrong:** User merges a 9am–10am session with a 2pm–3pm session. The 4-hour gap is added to `idleDeductedMs`, which is correct arithmetically but may surprise the user.

**How to avoid:** In the preview output, explicitly show the gap amount being absorbed as idle:
```
Merge preview:
  Session abc (09:00–10:00, 1h) + Session def (14:00–15:00, 1h)
  Gap: 4h 0m (will be treated as idle time)
  Merged result: 09:00–15:00, 2h billable (6h total - 4h idle)

  WARNING: Gap exceeds 1 hour. Use --force to proceed.
```

### Pitfall 4: `tt edit --start` Pushes Start After End

**What goes wrong:** `tt edit abc123 --start "20:00"` on a session that ends at 10:00 produces an invalid time range.

**How to avoid:** After applying all flag changes in memory (before committing), validate `newStartTime < newEndTime`:
```typescript
if (newEnd !== undefined && newStart !== undefined && newStart >= newEnd) {
  throw new InvalidTimeRangeError(newStart, newEnd)
}
```

### Pitfall 5: Positional Argument Index Off-by-One

**What goes wrong:** `ctx.positionals` in gunshi includes the command name at index 0. So for `tt edit abc123`, `ctx.positionals[0]` is `"edit"` and `ctx.positionals[1]` is `"abc123"`.

**How to avoid:** Use `ctx.positionals[1]` for the first user-provided positional. See existing pattern in `tag.ts` line 34 and `note.ts` line 28.

### Pitfall 6: Undo Log Grows Without Bound

**What goes wrong:** Heavy use over weeks produces thousands of undo_log rows, slightly bloating the SQLite file.

**How to avoid:** After each `push()`, trim the log to the most recent 20 entries with a `DELETE WHERE id NOT IN (SELECT id ... ORDER BY id DESC LIMIT 20)` query.

---

## Code Examples

Verified patterns from existing codebase and official sources:

### Drizzle Transaction (wrapping multi-row operations)
```typescript
// Source: https://orm.drizzle.team/docs/transactions
// Used for split, merge, and edit (all must be atomic)
db.transaction(() => {
  repos.undo.push('edit', snapshot)
  repos.sessions.update(id, changes)
  // if throws, entire transaction rolls back automatically
})
```

### Positional Argument Access in gunshi
```typescript
// Source: existing codebase — src/cli/commands/tag.ts:34
// positionals[0] = command name, positionals[1] = first user arg
const sessionId = ctx.positionals?.[1]
if (!sessionId) {
  errorOutput('Session ID required', 'Usage: tt edit <id> [flags]')
  process.exitCode = 1
  return
}
```

### luxon Time-Only Parsing for Edit Flags
```typescript
// Source: luxon docs https://moment.github.io/luxon/api-docs/index.html#datetimefromformat
import { DateTime } from 'luxon'

function parseEditTime(input: string, referenceDate: DateTime): DateTime {
  const full = DateTime.fromISO(input)
  if (full.isValid) return full

  const timeOnly = DateTime.fromFormat(input, 'HH:mm', { zone: referenceDate.zoneName })
  if (timeOnly.isValid) {
    return referenceDate.set({
      hour: timeOnly.hour,
      minute: timeOnly.minute,
      second: 0,
      millisecond: 0,
    })
  }
  throw new Error(`Cannot parse "${input}". Use HH:mm or YYYY-MM-DDTHH:mm.`)
}
```

### @inquirer/prompts confirm for Preview Gates
```typescript
// Source: https://www.npmjs.com/package/@inquirer/prompts
import { confirm } from '@inquirer/prompts'

// In split/merge command handler — only called when --yes is absent
if (!ctx.values.yes && process.stdout.isTTY) {
  const ok = await confirm({ message: 'Apply this change?' })
  if (!ok) {
    output('info', 'Cancelled')
    return
  }
}
// When stdout is not a TTY (piped/scripted), require --yes flag
if (!ctx.values.yes && !process.stdout.isTTY) {
  errorOutput('Non-interactive mode: use --yes to confirm')
  process.exitCode = 1
  return
}
```

### Proportional Idle Split
```typescript
// Pure arithmetic — no library
function splitIdleDeducted(
  original: Session,
  splitMs: number,
): { idleA: number; idleB: number } {
  const totalWall = original.endTime! - original.startTime
  const wallA = splitMs - original.startTime
  const wallB = original.endTime! - splitMs
  const idleA = Math.max(0, Math.round(original.idleDeductedMs * (wallA / totalWall)))
  const idleB = Math.max(0, original.idleDeductedMs - idleA)
  return { idleA, idleB }
}
```

### New Error Classes
```typescript
// Follow pattern in src/core/session/errors.ts
export class SessionNotFoundError extends Error {
  constructor(prefix: string) {
    super(`No session found matching "${prefix}"`)
    this.name = 'SessionNotFoundError'
  }
}

export class AmbiguousIdError extends Error {
  constructor(prefix: string, candidates: string[]) {
    super(`Ambiguous ID "${prefix}" matches: ${candidates.join(', ')}. Use more characters.`)
    this.name = 'AmbiguousIdError'
  }
}

export class NothingToUndoError extends Error {
  constructor() {
    super('Nothing to undo')
    this.name = 'NothingToUndoError'
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | Notes | Impact |
|--------------|------------------|-------|--------|
| `inquirer` (legacy) | `@inquirer/prompts` (modular) | `inquirer` v9+ split into individual scoped packages | Import `confirm` directly; tree-shakeable |
| `readline` for confirms | `@inquirer/prompts` | Built-in readline doesn't handle raw mode portably | Use @inquirer for reliability |
| Full event sourcing for undo | Snapshot table | Event sourcing is production-appropriate only when replay is a business requirement | One-level snapshot is correct for this use case |

**Current best practice:** Single-user CLI undo = snapshot table, not event log. For multi-user or audit requirements, revisit.

---

## Open Questions

1. **Should `tt undo` also undo `tt start` and `tt stop`?**
   - What we know: CORR-02 says "any state-changing operation (start, stop, edit, split, merge)"
   - What's unclear: `tt start` and `tt stop` are in session-service.ts; wrapping them to push to undo_log adds coupling between the two services. The snapshot for `stop` is trivial (just restore `endTime: null`). For `start`, undoing it soft-deletes the created session.
   - Recommendation: Implement for start/stop in plan 04-01. The snapshot-push call can live inside session-service.ts at the point where the DB write is confirmed.

2. **Merge across projects: allow with warning or hard-reject?**
   - What we know: The requirement says "merge two adjacent sessions" with no project constraint.
   - What's unclear: Merging sessions from different projects (e.g., merging 30min of project-A with 1h of project-B) produces a session with ambiguous billing. The resulting `rate_at_time` would be wrong.
   - Recommendation: Hard-reject with a clear error: "Cannot merge sessions from different projects. Reassign with `tt edit <id> --project <slug>` first."

3. **Short ID minimum length: 6 or 8 characters?**
   - What we know: Git uses 7 by default; docker uses 12. This project's UUIDs are 36 chars.
   - What's unclear: With a small session table (< 10,000 rows), 6 chars gives > 99.9999% uniqueness.
   - Recommendation: Require minimum 6 characters, use 8 as the display width in `tt log` output.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — this section is skipped per config.

---

## Sources

### Primary (HIGH confidence)
- Drizzle ORM transactions docs — https://orm.drizzle.team/docs/transactions — `db.transaction()` API, behavior options, nested savepoints
- Existing codebase `src/cli/commands/tag.ts` lines 32-34 — positional argument access pattern (`ctx.positionals[1]`)
- Existing codebase `src/db/repositories/session-repository.ts` — repository factory function pattern
- Existing codebase `src/db/schema.ts` — SQLite schema column patterns with drizzle-orm
- Existing codebase `src/db/migrate.ts` — migration via `MIGRATIONS_SQL` array pattern
- luxon API docs — `DateTime.fromISO`, `DateTime.fromFormat`, `.set()` — https://moment.github.io/luxon/api-docs/

### Secondary (MEDIUM confidence)
- SQLite official undo/redo documentation — https://www.sqlite.org/undoredo.html — trigger-based UNDOLOG pattern (reviewed; concluded snapshot approach is simpler for this use case)
- @inquirer/prompts npm page — https://www.npmjs.com/package/@inquirer/prompts — confirm/input API
- Gunshi docs — https://gunshi.dev/guide/essentials/getting-started — `define()` args spec

### Tertiary (LOW confidence)
- Community patterns (Xojo Forum, B4X Forum) confirming snapshot-based undo is the pragmatic approach for single-user SQLite apps

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core deps already in package.json; only `@inquirer/prompts` is new
- Architecture (undo): HIGH — snapshot pattern is documented, proven, and matches the one-level-undo requirement exactly
- Architecture (split/merge): HIGH — pure arithmetic; the proportional idle formula is derived from first principles and verified
- Pitfalls: HIGH — derived from reading existing codebase code paths and reasoning about edge cases
- Positional arg pattern: HIGH — confirmed in two existing command files

**Research date:** 2026-02-28
**Valid until:** 2026-05-28 (stable libraries, 90-day validity)
