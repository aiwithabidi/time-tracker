# Phase 3: Reporting & Export - Research

**Researched:** 2026-02-28
**Domain:** CLI table formatting, CSV export, date range filtering, duration formatting
**Confidence:** HIGH

## Summary

Phase 3 covers reporting commands (`tt today`, `tt week`, `tt log`, `tt last`) and CSV export (`tt export csv`). The project already has Luxon for dates, Chalk for colors, and a `formatDuration()` utility in `src/cli/format.ts`. The existing codebase uses gunshi for CLI commands and Drizzle ORM with SQLite. The session repository already has `findByDateRange(from, to, projectId?)` which provides the query foundation for all reports.

The key decisions are: (1) use cli-table3 for terminal table formatting -- it is the dominant library with 19M+ weekly downloads, (2) hand-roll CSV generation since the export schema is simple and fixed, (3) continue using Luxon (already installed) for all date range calculations, and (4) extend the existing `formatDuration()` function rather than pulling in a library.

**Primary recommendation:** Use cli-table3 for tabular reports, hand-roll CSV with proper RFC 4180 escaping, and leverage Luxon's `startOf`/`endOf` for date range presets.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROJ-04 | List all known projects with `tt projects` (showing this-week totals) | cli-table3 table formatting, Luxon week range calculation, existing `findByDateRange` |
| REPT-01 | Today's time breakdown by project with `tt today` | Luxon `startOf('day')`/`endOf('day')`, cli-table3 table, `formatDuration` |
| REPT-02 | Weekly time report with `tt week` (optionally filtered by project) | Luxon `startOf('week')`/`endOf('week')`, cli-table3, project filter flag |
| REPT-03 | Browse session history with `tt log` (filterable by project, date range) | cli-table3 or Watson-style log format, `--from`/`--to`/`--project` flags |
| REPT-04 | Last completed session with `tt last` | Single session query (most recent with endTime not null) |
| REPT-05 | All time displays use human-readable format (Xh Ym) | Existing `formatDuration()` in `src/cli/format.ts` already handles this |
| REPT-06 | Billable totals per project with `tt week --billable` | Multiply duration by `rateAtTime`, format currency |
| EXPT-01 | Export sessions to CSV with `tt export csv --project=x --from=DATE --to=DATE` | Hand-rolled CSV generator with RFC 4180 escaping |
| EXPT-02 | Export includes project, date, start time, end time, duration, notes, tags | Join sessions with notes/tags from related tables |
| EXPT-03 | Export supports --dry-run to preview without writing file | Output to stdout vs file write |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cli-table3 | ^0.6.x | Terminal table rendering | 19M+ weekly downloads, maintained, TypeScript types via `@types/cli-table3`, supports column alignment, word wrap, color |
| chalk | ^5.6.2 | Terminal colors | Already installed in project |
| luxon | ^3.7.2 | Date range calculations | Already installed in project, immutable API, timezone-aware |
| gunshi | ^0.29.2 | CLI command framework | Already installed, used for all existing commands |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/cli-table3 | latest | TypeScript types for cli-table3 | Dev dependency, install alongside cli-table3 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cli-table3 | tty-table | tty-table has 40x fewer downloads, similar features but less ecosystem support |
| cli-table3 | Custom chalk formatting | More control but you hand-roll alignment, padding, truncation -- not worth it |
| Hand-rolled CSV | papaparse / csv-stringify | Overkill for generating fixed-schema output; would add dependency for ~20 lines of code |
| Luxon | date-fns | Would require replacing existing dependency; Luxon is already installed and working |

**Installation:**
```bash
bun add cli-table3 && bun add -d @types/cli-table3
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── cli/
│   ├── commands/
│   │   ├── today.ts         # tt today
│   │   ├── week.ts          # tt week / tt week --billable
│   │   ├── log.ts           # tt log
│   │   ├── last.ts          # tt last
│   │   ├── projects.ts      # tt projects
│   │   └── export.ts        # tt export csv
│   ├── format.ts            # Extend with table helpers
│   └── table.ts             # NEW: table formatting utilities
├── services/
│   ├── report-service.ts    # NEW: aggregation logic (group by project/day)
│   └── export-service.ts    # NEW: CSV generation
```

### Pattern 1: Report Service (Aggregation Layer)
**What:** A service that queries sessions and aggregates them by project/day/week, computing totals.
**When to use:** All report commands delegate to this service rather than querying DB directly.
**Example:**
```typescript
// src/services/report-service.ts
import { DateTime } from 'luxon'

interface DaySummary {
  readonly date: string           // ISO date
  readonly projectSlug: string
  readonly projectName: string
  readonly totalMs: number
  readonly sessionCount: number
  readonly billableAmount: number | null
}

interface WeekSummary {
  readonly weekStart: string
  readonly weekEnd: string
  readonly days: readonly DaySummary[]
  readonly totalMs: number
  readonly billableTotal: number | null
}

export function createReportService(repos: Repositories) {
  return {
    getToday(timezone: string): DaySummary[] {
      const now = DateTime.now().setZone(timezone)
      const from = now.startOf('day').toMillis()
      const to = now.endOf('day').toMillis()
      const sessions = repos.session.findByDateRange(from, to)
      return aggregateByProject(sessions, repos)
    },

    getWeek(timezone: string, projectId?: string): WeekSummary {
      const now = DateTime.now().setZone(timezone)
      const from = now.startOf('week').toMillis()
      const to = now.endOf('week').toMillis()
      const sessions = repos.session.findByDateRange(from, to, projectId)
      return aggregateByWeek(sessions, repos, from, to)
    },

    getLog(options: { from?: number; to?: number; projectId?: string }): Session[] {
      const from = options.from ?? 0
      const to = options.to ?? Date.now()
      return repos.session.findByDateRange(from, to, options.projectId)
    },
  }
}
```

### Pattern 2: Table Formatting Utilities
**What:** Thin wrappers around cli-table3 with project-consistent styling.
**When to use:** Every command that outputs tabular data.
**Example:**
```typescript
// src/cli/table.ts
import Table from 'cli-table3'
import chalk from 'chalk'

// Borderless compact style (Watson/timetrap inspired)
const COMPACT_CHARS = {
  'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
  'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
  'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
  'right': '', 'right-mid': '', 'middle': '  ',
}

export function createCompactTable(head: string[]): Table.Table {
  return new Table({
    head: head.map(h => chalk.dim(h)),
    chars: COMPACT_CHARS,
    style: { head: [], border: [], 'padding-left': 0, 'padding-right': 1 },
  })
}

// Bordered table for weekly summaries
export function createBorderedTable(head: string[]): Table.Table {
  return new Table({
    head,
    style: { head: ['cyan'], border: ['dim'] },
  })
}
```

### Pattern 3: Watson-Style Log Format
**What:** Group entries by day, show time range + duration + project, with day subtotals.
**When to use:** `tt log` command -- this is the most readable format for session history.
**Example output:**
```
Wednesday Feb 26, 2026
  09:15 - 11:42   2h 27m   time-tracker  [feature, billable]
  13:00 - 14:30   1h 30m   client-proj   [meeting]
                   3h 57m

Thursday Feb 27, 2026
  10:00 - 12:15   2h 15m   time-tracker  [bugfix]
                   2h 15m

Total             6h 12m
```

### Pattern 4: CSV Export
**What:** Generate RFC 4180 compliant CSV without external library.
**When to use:** `tt export csv` command.
**Example:**
```typescript
// src/services/export-service.ts
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCSVRow(fields: readonly string[]): string {
  return fields.map(escapeCSVField).join(',')
}

const CSV_HEADERS = [
  'project', 'date', 'start_time', 'end_time',
  'duration_hours', 'duration_human', 'notes', 'tags',
] as const

export function sessionsToCSV(
  sessions: SessionWithDetails[],
  timezone: string,
): string {
  const rows = [toCSVRow([...CSV_HEADERS])]

  for (const s of sessions) {
    const start = DateTime.fromMillis(s.startTime).setZone(timezone)
    const end = s.endTime ? DateTime.fromMillis(s.endTime).setZone(timezone) : null
    const durationMs = (s.endTime ?? Date.now()) - s.startTime - s.idleDeductedMs
    const durationHours = (durationMs / 3_600_000).toFixed(2)

    rows.push(toCSVRow([
      s.projectSlug,
      start.toISODate() ?? '',
      start.toFormat('HH:mm'),
      end?.toFormat('HH:mm') ?? 'active',
      durationHours,
      formatDuration(durationMs),
      s.notes.join('; '),
      s.tags.join(', '),
    ]))
  }

  return rows.join('\n') + '\n'
}
```

### Pattern 5: Date Range Flag Parsing
**What:** Parse `--from` and `--to` flags as ISO dates or relative keywords.
**When to use:** `tt log` and `tt export csv` commands.
**Example:**
```typescript
// src/cli/date-parsing.ts
import { DateTime } from 'luxon'

export function parseDateFlag(value: string, timezone: string): DateTime {
  // Try ISO date first (2026-02-28)
  const iso = DateTime.fromISO(value, { zone: timezone })
  if (iso.isValid) return iso

  // Try relative keywords
  const now = DateTime.now().setZone(timezone)
  switch (value.toLowerCase()) {
    case 'today': return now.startOf('day')
    case 'yesterday': return now.minus({ days: 1 }).startOf('day')
    case 'monday': return now.startOf('week')
    default:
      throw new Error(`Invalid date: "${value}". Use ISO format (2026-02-28) or keywords (today, yesterday).`)
  }
}
```

### Anti-Patterns to Avoid
- **Querying inside display logic:** Keep aggregation in report-service, formatting in CLI layer. Commands should call service, then format result.
- **Hardcoding timezone:** Always use the timezone from the session or config. Never assume UTC or local. Sessions already store `timezone` column.
- **Computing duration from raw start/end without idle deduction:** Always subtract `idleDeductedMs`: `(endTime - startTime) - idleDeductedMs`.
- **Using `console.log` for output:** Use `process.stdout.write()` for data output (supports piping), `process.stderr.write()` for errors. The existing codebase already follows this pattern in `format.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal table alignment | Custom string padding | cli-table3 | Unicode width, ANSI escape codes, terminal resize -- all solved |
| Terminal colors | Raw ANSI codes | chalk (already installed) | Cross-platform, respects NO_COLOR |
| Date arithmetic | Manual ms math | Luxon (already installed) | DST transitions, timezone boundaries, week start locale |

**Key insight:** CSV generation IS simple enough to hand-roll (fixed schema, no streaming needed, ~20 lines). Table formatting is NOT (Unicode width calculation, ANSI escape handling, terminal width detection).

## Common Pitfalls

### Pitfall 1: Duration calculation ignoring idle time
**What goes wrong:** Reporting `endTime - startTime` as the session duration, producing inflated hours.
**Why it happens:** The `idleDeductedMs` field is easy to forget.
**How to avoid:** Create a single `getSessionDurationMs(session)` utility that always computes `(endTime ?? Date.now()) - startTime - idleDeductedMs`. Use it everywhere.
**Warning signs:** Reported hours exceed wall-clock time between start and end.

### Pitfall 2: Timezone mismatch in "today" queries
**What goes wrong:** Using UTC midnight as "today" boundary when user is in a different timezone, causing sessions to appear on wrong day.
**Why it happens:** `Date.now()` and `new Date()` work in UTC by default.
**How to avoid:** Always use `DateTime.now().setZone(timezone).startOf('day')` for day boundaries. The timezone comes from session records or user config.
**Warning signs:** Late-night sessions show up on the next day (or vice versa).

### Pitfall 3: Active sessions in reports
**What goes wrong:** `tt today` or `tt week` excludes the currently-running session because `endTime` is null.
**Why it happens:** `findByDateRange` filters on `startTime` range but active sessions have no `endTime`.
**How to avoid:** Include active sessions in reports by treating `endTime ?? Date.now()` as the effective end time. The existing `findByDateRange` already handles this (it filters on `startTime` not `endTime`).

### Pitfall 4: CSV with commas in notes
**What goes wrong:** Notes containing commas or newlines break CSV column alignment in spreadsheet software.
**Why it happens:** Naive `fields.join(',')` without escaping.
**How to avoid:** Always run fields through `escapeCSVField()` that wraps in quotes and doubles internal quotes per RFC 4180.

### Pitfall 5: cli-table3 import in ESM
**What goes wrong:** `import Table from 'cli-table3'` fails or returns undefined.
**Why it happens:** cli-table3 is a CommonJS module.
**How to avoid:** With Bun, `import Table from 'cli-table3'` should work due to Bun's CJS/ESM interop. If issues arise, use `import { createRequire } from 'module'` pattern. Test the import early.

### Pitfall 6: Week start day locale
**What goes wrong:** `startOf('week')` returns Sunday in US locale but Monday in ISO/European locale.
**Why it happens:** Luxon defaults to locale-dependent week start.
**How to avoid:** Be explicit: `DateTime.now().startOf('week')` uses locale settings. If you want Monday-start consistently, use `DateTime.now().startOf('week', { useLocaleWeeks: true })` or set locale. Document the choice.

## Code Examples

### Today Report Command
```typescript
// src/cli/commands/today.ts
import { define } from 'gunshi'
import { createCompactTable } from '../table'
import { formatDuration, output } from '../format'
import { createSessionService, handleCommandError } from '../helpers'

const todayCommand = define({
  name: 'today',
  description: 'Show today\'s time breakdown by project',
  args: {},
  run: () => {
    try {
      const service = createSessionService()
      // ... get today's sessions, aggregate by project
      // ... render with createCompactTable
    } catch (error) {
      handleCommandError(error)
    }
  },
})

export default todayCommand
```

### Weekly Billable Report
```typescript
// Example output for tt week --billable:
//
// Week of Feb 24 - Mar 1, 2026
//
// Project         Mon   Tue   Wed   Thu   Fri   Total    Amount
// time-tracker    2h    3h    1h    4h    2h    12h 0m   --
// client-proj     4h    3h    5h    2h    6h    20h 0m   $2,000.00
//                                                        ─────────
// Total           6h    6h    6h    6h    8h    32h 0m   $2,000.00
```

### Export Command with Dry Run
```typescript
// tt export csv --project=client-proj --from=2026-02-01 --to=2026-02-28
// Outputs CSV to stdout (pipe to file: tt export csv ... > report.csv)
//
// tt export csv --project=client-proj --from=2026-02-01 --to=2026-02-28 --dry-run
// Shows preview: "Would export 15 sessions (23h 45m) to CSV"
```

### Billable Amount Formatting
```typescript
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| moment.js for dates | Luxon (by Moment team) | 2020+ | Already using Luxon -- no change needed |
| cli-table (unmaintained) | cli-table3 (actively maintained fork) | 2018+ | Use cli-table3, not cli-table |
| Heavy CSV libraries | Hand-roll for simple exports | Always valid for fixed schemas | No dependency needed for CSV generation |
| console.log output | process.stdout.write | Best practice | Supports piping, already used in project |

**Deprecated/outdated:**
- moment.js: Officially in maintenance mode, recommends Luxon
- cli-table / cli-table2: Unmaintained, replaced by cli-table3

## Open Questions

1. **Week start day preference**
   - What we know: Luxon's `startOf('week')` is locale-dependent (Monday in ISO, Sunday in US)
   - What's unclear: User's preference for week start
   - Recommendation: Default to Monday (ISO standard), document it. Can add `--week-start` flag later.

2. **Export destination: stdout vs file**
   - What we know: Requirement says `tt export csv`, with `--dry-run` for preview
   - What's unclear: Should CSV go to stdout (Unix-friendly, pipe to file) or write to a named file?
   - Recommendation: Output to stdout by default (pipe-friendly: `tt export csv > report.csv`). `--dry-run` shows count/summary only. This matches Unix conventions and avoids needing to handle file path arguments.

3. **Joining notes and tags for export**
   - What we know: Sessions can have multiple notes and tags
   - What's unclear: Best representation in a flat CSV row
   - Recommendation: Join notes with "; " separator, tags with ", " separator. Single columns for each.

## Sources

### Primary (HIGH confidence)
- [cli-table3 npm](https://www.npmjs.com/package/cli-table3) - Download stats, API, version
- [cli-table3 basic-usage.md](https://github.com/cli-table/cli-table3/blob/master/basic-usage.md) - Chars config, styling options
- [Luxon documentation](https://moment.github.io/luxon/api-docs/index.html) - DateTime API, startOf/endOf, timezone handling
- [Watson GitHub](https://github.com/jazzband/Watson) - Report output format examples
- [Timetrap GitHub](https://github.com/samg/timetrap) - Log display format examples

### Secondary (MEDIUM confidence)
- [npm trends comparison](https://npmtrends.com/cli-table-vs-cli-table3-vs-table-vs-tty-table) - Download comparison data
- [RFC 4180 CSV escaping](https://ssojet.com/escaping/csv-escaping-in-typescript) - CSV field escaping rules

### Tertiary (LOW confidence)
- None -- all findings verified with primary/secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries already installed (Luxon, Chalk) or well-established (cli-table3)
- Architecture: HIGH - Patterns follow existing project conventions (gunshi commands, service layer, repository pattern)
- Pitfalls: HIGH - Based on real timezone/duration bugs common in time-tracking tools
- CSV export: HIGH - RFC 4180 is well-documented, schema is fixed and simple

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable domain, no fast-moving dependencies)
