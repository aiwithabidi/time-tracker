# Pitfalls Research

**Domain:** CLI time tracking tool with Claude Code hook integration
**Researched:** 2026-02-27
**Confidence:** HIGH (hook issues), HIGH (SQLite concurrency), MEDIUM (idle detection), MEDIUM (timezone handling)

---

## Critical Pitfalls

### Pitfall 1: Claude Code Stop/SessionStart Hooks Are Unreliable

**What goes wrong:**
The Stop hook does not fire in multiple documented scenarios: when Claude ends its turn immediately after a tool call, when used inside Skills, when hooks stop executing after ~2.5 hours in the same session (silent degradation, no error logged), and when hooks hang on certain versions or configurations. SessionStart hooks have separate but equally problematic failures: output is never injected in new conversations, hooks fail with exit 0 but display "hook error" in the UI, and hooks are not called on the very first startup in some plugin configurations.

The consequence for a time tracker is catastrophic: sessions never start (false zero), sessions never close (runaway open sessions), or sessions appear closed while the user is still actively working.

**Why it happens:**
Claude Code's hook system was designed primarily for context injection and automation side-effects, not for reliable I/O-critical event delivery. The Stop hook in particular is a best-effort notification — it is explicitly documented as not being able to block termination. The tool was also not designed with multi-terminal scenarios in mind, so edge cases compound.

Known bug references:
- Stop hooks not triggered after tool call: github.com/anthropics/claude-code/issues/3113
- Stop hooks silently stop after ~2.5 hours: github.com/anthropics/claude-code/issues/16047
- SessionStart hooks not working for new conversations: github.com/anthropics/claude-code/issues/10373
- SessionStart hooks blocking CLI startup: github.com/anthropics/claude-code/issues/23359

**How to avoid:**
Design the hook integration as an unreliable event source, not a reliable transaction system. The session lifecycle must be self-healing:

1. **Heartbeat writes over point-in-time events**: Instead of relying on Stop to close a session, write a heartbeat record every N minutes while the session is active. A session is "closed" when the last heartbeat is more than (heartbeat_interval + buffer) minutes in the past.
2. **Session reconciliation on startup**: When SessionStart fires, check for any sessions from this terminal that have a stale heartbeat and auto-close them before opening the new session. This handles the case where Stop never fired.
3. **Idempotent hook scripts**: Hook scripts must be safe to call multiple times, out of order, or not at all. Never write hook scripts that depend on a previous hook having completed.
4. **Maximum session duration cap**: Enforce a hard cap (e.g., 24 hours) on any open session. Any session older than the cap is auto-closed during the next startup reconciliation.
5. **Keep hook scripts under 100ms**: Long-running hooks risk timing out or blocking Claude Code. Do all heavy work asynchronously (fire-and-forget to a background daemon).

**Warning signs:**
- Sessions appearing to run for days or weeks
- Sessions with zero duration that never got a Stop event
- Duplicate open sessions for the same project/terminal after restart
- Hook error messages in Claude Code UI despite the script exiting cleanly

**Phase to address:**
Phase 1 (Core session lifecycle) — must be designed for resilience from day one. Cannot be retrofitted.

---

### Pitfall 2: SQLite "Database Is Locked" Across Multiple Terminals

**What goes wrong:**
With 4-8 simultaneous Claude Code sessions open across different terminals, multiple hook processes attempt to write to the SQLite database at the same time. Without WAL mode and proper transaction handling, writers block each other. Without a configured `busy_timeout`, any contended write fails immediately with `SQLITE_BUSY` instead of waiting. The default SQLite behavior does not schedule concurrent writers fairly — a hook process can fail silently while another terminal holds the write lock.

**Why it happens:**
SQLite allows only one writer at a time in any journal mode. In rollback (default) mode, even readers block writers. WAL mode fixes reader/writer contention but does not fix writer/writer contention. When hook scripts spawn as short-lived processes (one per hook event, one per terminal), they have no coordination mechanism unless explicitly configured.

The default Bun SQLite connection has no busy timeout set, meaning the first `SQLITE_BUSY` error will throw rather than retry.

**How to avoid:**
1. **Enable WAL mode immediately after opening the database**: `PRAGMA journal_mode = WAL`
2. **Set a busy timeout of 5-10 seconds**: `PRAGMA busy_timeout = 5000` — this tells SQLite to retry writes automatically before throwing
3. **Use `BEGIN IMMEDIATE` for all write transactions**: Without this, a transaction that starts as a read and later upgrades to a write will fail with SQLITE_BUSY even with a timeout set
4. **Keep write transactions short**: Heartbeat writes and session open/close events should be single-statement or minimal two-statement transactions
5. **Use a single writer daemon architecture**: Consider routing all writes through a single background daemon process that owns the connection, with hooks sending lightweight IPC messages (Unix socket or named pipe). This eliminates writer/writer contention entirely.

**Warning signs:**
- `SQLITE_BUSY` or `database is locked` errors in hook logs
- Missing heartbeat records during high-activity periods
- Session start/stop events disappearing from the database intermittently

**Phase to address:**
Phase 1 (Data storage setup) — WAL mode and busy timeout must be configured before any concurrent usage. The daemon architecture decision should be made in Phase 1 design, not retrofitted later.

---

### Pitfall 3: Orphaned Open Sessions From Process Kills and Crashes

**What goes wrong:**
If Claude Code is killed with SIGKILL (kill -9, system crash, OOM killer, Force Quit), the Stop hook never runs. The session stays open in the database permanently. Over time, the user accumulates phantom sessions showing hours of active work that actually never happened. Billable totals are inflated. Analytics are corrupted.

This is worse than just inaccurate data — users billing clients from this data could overcharge.

**Why it happens:**
SIGKILL cannot be caught or handled. No cleanup code runs. The Stop hook is invoked by Claude Code on clean exit only. Hard kills bypass all graceful shutdown paths.

**How to avoid:**
1. **Heartbeat-based session lifecycle (same as Pitfall 1)**: A session without a recent heartbeat is treated as stale, not active. The heartbeat timeout IS the session's implicit end time when no explicit Stop fires.
2. **Session "last seen" timestamp** updated every heartbeat — reports should use `MIN(explicit_end, last_heartbeat + grace_period)` as the effective end time
3. **Startup reconciliation**: On any SessionStart, close all stale sessions for this terminal before opening a new one
4. **Max session age cap**: Any session older than 24 hours is auto-closed on next database access
5. **`tt status` command warns about stale sessions**: Shows the user any sessions that appear to be open but have stale heartbeats, prompting manual review

**Warning signs:**
- Open sessions with `last_heartbeat` more than 30 minutes ago
- Sessions starting and then having no further activity
- User reports of inflated weekly totals

**Phase to address:**
Phase 1 (Core architecture) — the heartbeat mechanism must be part of the initial design, not added after launch.

---

### Pitfall 4: Idle Detection That Is Either Useless or Annoying

**What goes wrong:**
Two failure modes: (1) idle detection is too aggressive — it pauses sessions when the developer is actively thinking, reading docs, or waiting for a build, creating constant interruptions and training the user to distrust the tool; (2) idle detection is too lenient — it never pauses, so a session that started at 9am and the computer was left overnight shows 16 hours of tracked time.

Both modes destroy trust and accuracy. Once users distrust the data, they stop using the tool.

**Why it happens:**
Idle detection based purely on input events (keyboard/mouse) misclassifies developer work patterns. Developers routinely have 5-20 minute stretches with no input activity while reading, thinking, or waiting for compile/test cycles. Using a threshold tuned for generic workers (3-5 minutes) aggressively flags these as idle.

**How to avoid:**
1. **Use macOS `HIDIdleTime` for system-level input detection** — this is more reliable than keyboard/mouse polling because it accounts for all input devices
2. **Implement two-tier thresholds matching the project spec**: soft idle (~8 min) triggers a "still working?" visual indicator without pausing; hard idle (~20 min) triggers auto-pause
3. **Never ask the user to confirm idle status in a hook script** — hooks must be non-interactive; idle prompts belong in the CLI dashboard status view only
4. **Do not count idle time as tracked time, but do not delete it either**: Store idle gaps separately so the user can review and reclaim time that was actually productive
5. **Provide an easy `tt undo idle` command** for false-positive idle detections

The 8-minute soft threshold specifically matches developer workflow — short enough to catch genuine idle (lunch, meeting) but long enough to not interrupt deep work.

**Warning signs:**
- User frequently running `tt undo` or manually editing session end times
- Sessions accumulating suspiciously round durations (always showing exactly 8 or 20 minutes)
- User complaints that the tool is "too noisy"

**Phase to address:**
Phase 2 (Idle detection) — the threshold values and the two-tier architecture must be explicit design decisions, not implementation details.

---

### Pitfall 5: Double-Counting Sessions Across Multiple Terminals

**What goes wrong:**
The user has 3 terminals open in the same project directory. Each terminal runs Claude Code. Each Claude Code instance fires its own SessionStart hook. The time tracker creates 3 independent sessions for the same project, tripling the tracked time.

When the user reviews their week, they see 60 hours for a 20-hour project. This is the most damaging accuracy failure for a billing tool.

**Why it happens:**
Without explicit terminal identity and a singleton-per-project enforcement policy, each hook invocation is treated as a new session. The natural instinct is to key sessions on project directory alone, which is insufficient.

**How to avoid:**
1. **Terminal identity via `TT_TERMINAL_ID`**: Each terminal must have a unique, persistent identifier set in the shell profile. The time tracker refuses to open a session without this identifier.
2. **Singleton session per project, not per terminal**: When a SessionStart fires for project X from terminal B, and a session for project X is already open from terminal A, terminal B "attaches" to the existing session instead of opening a new one. Only one session accumulates time.
3. **Attach semantics, not merge semantics**: Terminal B's activity is recorded as part of the same session, but the session shows which terminals were active during which intervals (for debugging double-count issues).
4. **Session lock record**: Write a session lock record that includes the terminal ID that "owns" the session. Other terminals check this record before creating a new session.
5. **Heartbeats from all terminals**: Any terminal's heartbeat keeps the session alive, but only the owning terminal's Stop event closes it. If the owner crashes, ownership can be transferred via timestamp-based election on next startup.

**Warning signs:**
- Total weekly hours exceeding feasible working hours
- Multiple open sessions with the same project ID
- Database showing 3x sessions on days with multiple terminals

**Phase to address:**
Phase 1 (Core architecture) — terminal identity and singleton enforcement must be in the initial design. Adding this later requires a data migration.

---

## Moderate Pitfalls

### Pitfall 6: Timezone and DST Corruption

**What goes wrong:**
The developer travels or changes their system timezone. Stored timestamps are correct in UTC, but reporting queries display times in the wrong timezone because the offset at display time differs from the offset at recording time. DST transitions create 1-hour gaps or double-counted hours in daily aggregations. A session starting at 1:30am on a DST changeover night appears to end before it started.

**How to avoid:**
Store all timestamps as **Unix milliseconds (UTC integers)** in SQLite — never as timezone-aware strings. Store the IANA timezone name at session creation as a separate column (e.g., `America/New_York`), not the UTC offset (offsets change with DST, zone names do not). When displaying times, convert from UTC to the stored timezone using the zone name, not the current system timezone. For DST-ambiguous sessions, flag them for review rather than silently computing incorrect durations.

**Phase to address:**
Phase 1 (Schema design) — cannot be fixed without a migration after data is collected.

---

### Pitfall 7: Hook Script Performance Slowing Claude Code Startup

**What goes wrong:**
Hook scripts that take more than 100ms make Claude Code feel sluggish on startup. If SessionStart hooks involve database opens, schema migrations, config file parsing, or any I/O, they compound into noticeable latency. Claude Code itself documents that SessionStart hooks should be kept fast.

**How to avoid:**
1. **Background daemon architecture**: Hook scripts are thin shims (under 50ms target) that send a fire-and-forget message to a background daemon. The daemon does all I/O.
2. **Lazy schema migration**: Database schema migrations happen in the daemon, not in the hook script.
3. **Pre-warmed daemon**: The daemon starts at login (via launchd plist), so it is already running when the first Claude Code session starts.
4. **Benchmark every hook script**: Include a benchmark in the test suite that asserts hook scripts complete in under 100ms on a cold start.

**Phase to address:**
Phase 1 (Architecture) — the daemon vs. inline decision shapes the entire system.

---

### Pitfall 8: Project Inference Misclassification

**What goes wrong:**
The tool infers the project from the current working directory. When the developer is in a monorepo subdirectory (`/projects/client-a/packages/auth`), the tool either assigns time to the monorepo root (too coarse) or to the subdirectory (too fine-grained and creates dozens of phantom "projects"). When the developer runs commands from a shared utility directory or home directory, random utility work gets billed to the last detected project.

**How to avoid:**
1. **Git root detection as the primary signal**: Walk up the directory tree to find the nearest `.git` directory. That is the project root, not the CWD.
2. **Explicit project config takes precedence**: Users should be able to define `~/.config/timetracker/projects.toml` mapping git roots to client/project names, overriding all inference.
3. **"Unknown project" as a valid state**: When no project can be confidently inferred, create the session under an "uncategorized" bucket rather than assigning to the wrong project.
4. **Monorepo awareness**: Allow mapping subdirectory patterns within a single git repo to different project IDs (e.g., `packages/client-a/**` → "Client A").
5. **Always prompt the user to confirm new project detection**: The first time a new git root is seen, surface a confirmation before creating a project record.

**Phase to address:**
Phase 1 (Project detection logic) — the inference hierarchy should be established before tracking data accumulates under wrong project names.

---

### Pitfall 9: Data Loss From Disk Full or I/O Errors During Write

**What goes wrong:**
When disk space runs out during a SQLite write, the database file can be partially written and corrupted — this is a documented Timewarrior bug that destroyed entire months of data. Hook scripts that fail silently when the database write fails give the user no indication that tracking is broken.

**How to avoid:**
1. **SQLite integrity checks**: Run `PRAGMA integrity_check` periodically (e.g., on daemon startup).
2. **Automatic backups**: Keep a rolling 7-day backup of the database file. A cron job or launchd agent copies the file daily.
3. **Transactional writes only**: Never write partial records. All session updates must be wrapped in explicit transactions that either commit fully or roll back.
4. **Hook error propagation**: When a hook script cannot write to the database (disk full, locked, corrupted), it must log the failure to a separate error file (not the database) and surface it in `tt status`.
5. **Graceful degradation**: A broken database write should not crash Claude Code. The hook exits 0 but queues the event for retry.

**Phase to address:**
Phase 1 (Storage layer) and Phase 4+ (Operations/maintenance features).

---

### Pitfall 10: Hourly Rate History Corruption

**What goes wrong:**
The developer changes a project's hourly rate. Historical sessions automatically recalculate at the new rate, overstating or understating past billable amounts. Invoice that was already sent to the client no longer matches what the tool reports. This is a billing integrity failure.

**How to avoid:**
Snapshot the hourly rate at session creation time in a `rate_at_time` column. Never derive historical billable amounts from the current project rate. The current rate is only used for new sessions. Changing a rate only affects sessions created after the change.

**Phase to address:**
Phase 1 (Schema design) — this is a schema-level decision that cannot be fixed without a data migration.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline hook scripts (no daemon) | Simpler initial setup | Claude Code startup latency; harder to coordinate concurrent writes | Never — design the daemon from day one |
| Store timestamps as timezone-aware strings | Readable in DB browser | DST corruption, sorting breaks, migration required | Never |
| Single session per terminal (not per project) | Avoids singleton complexity | Double-counting across terminals, cannot be fixed without migration | Never |
| Skip heartbeat mechanism, rely on Stop hook | Less complexity | Orphaned sessions from crashes/kills, inflated billing data | Never |
| In-memory rate at query time (not stored per session) | Simpler schema | Historical billing amounts change when rate changes | Never |
| No project config file, inference only | Simpler v1 | Misclassification accumulates, hard to correct retroactively | Acceptable as MVP IF "uncategorized" bucket exists and correction UI ships in Phase 2 |
| Skip WAL mode in development | Works fine single-user | Fails immediately in multi-terminal use | Never — enable WAL from day one |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Code hooks | Treating Stop as a reliable close event | Design heartbeat-based lifecycle; Stop is a hint, not a guarantee |
| Claude Code hooks | Writing more than ~500ms of I/O in hook scripts | Fire-and-forget to daemon; hook script just sends a message |
| Claude Code hooks | Depending on hook output being injected into context | Output injection is known to be broken for new conversations (issue #10373) — don't depend on it for session tracking |
| SQLite via Bun | Opening a new connection per hook invocation without configuring WAL/timeout | Use a persistent daemon connection with WAL mode and 5s busy timeout |
| macOS idle detection | Polling keyboard/mouse events at the application level | Use `ioreg -c IOHIDSystem` (via `HIDIdleTime`) for system-level idle detection that survives input device switching |
| Git context capture | Running `git log` or `git diff` in hook scripts (slow on large repos) | Run only `git rev-parse HEAD` and `git branch --show-current` — fast, constant-time operations |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous database writes in hook scripts | Noticeable Claude Code startup lag | Async daemon with fire-and-forget IPC | From the first multi-terminal user |
| Full table scan for analytics on large session history | `tt week` becomes slow after 6+ months of data | Index on (project_id, started_at); index on started_at | ~1,000+ sessions without indexes |
| WAL file growing unbounded | Database reads slow down over time | Set `wal_autocheckpoint = 1000` (SQLite default is 1000 — verify it is not disabled) | After ~50,000 write operations |
| No SQLite cache size set | Extra I/O on every query | `PRAGMA cache_size = -32000` (32MB) | Low-memory systems or large databases |
| Computing durations at query time from open sessions | Incorrect durations when session is still open | Use `COALESCE(ended_at, last_heartbeat)` as the effective end time | Every query on active sessions |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Prompting user during idle detection | Interrupts flow state, trains users to distrust tool | Non-interactive idle: pause silently, show in `tt status`; let user reclaim time with `tt undo idle` |
| Requiring manual project confirmation for every session | Friction eliminates passive tracking value | Auto-detect and assign; surface only first-time new project detection; allow bulk correction later |
| Reporting raw seconds in CLI output | Unreadable, forces mental math | Always display as `Xh Ym`; show seconds only in export/debug mode |
| No undo command | User errors are permanent, creates data anxiety | Implement `tt undo` as a first-class command from Phase 1; every mutation is reversible |
| Silent hook failures | User thinks tracking is working when it is not | `tt status` must always show hook health: last successful heartbeat, whether daemon is running, any recent write errors |
| Merging split sessions immediately without preview | User accidentally destroys session boundaries | All destructive operations (`merge`, `delete`) require confirmation or auto-create a snapshot |

---

## "Looks Done But Isn't" Checklist

- [ ] **Session lifecycle**: Verify sessions close correctly when Claude Code is `kill -9`'d, not just on clean exit. Test by killing the process and checking the database.
- [ ] **Multi-terminal deduplication**: Open 3 terminals in the same project directory simultaneously. Verify only one session is created, not three.
- [ ] **Timezone transition**: Change system timezone mid-session. Verify the session duration is calculated correctly and reports display in the correct timezone.
- [ ] **DST boundary**: Create a session that spans a DST transition (e.g., session starts at 1am, transitions at 2am). Verify duration is 2 hours, not 1 or 3.
- [ ] **Disk full graceful handling**: Fill the disk to 100% while tracking. Verify no database corruption and the error is surfaced in `tt status`.
- [ ] **Idle detection non-interactivity**: Verify idle detection never produces stdout/stderr output that would be captured by Claude Code and displayed as hook output.
- [ ] **Hook startup latency**: Run `time` on the SessionStart hook script 10 times cold. Verify P99 is under 100ms.
- [ ] **Rate history**: Change a project's hourly rate. Verify past sessions still show the old rate in reports, not the new one.
- [ ] **WAL mode enabled**: Connect to the database with any SQLite browser and run `PRAGMA journal_mode`. Verify it returns `wal`.
- [ ] **Orphan cleanup**: Manually create a session with a stale `last_heartbeat` (30 minutes ago, no end time). Start a new Claude Code session for the same project. Verify the orphan is auto-closed.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Orphaned open sessions | LOW | Run `tt reconcile` or `tt status --fix`; manually close stale sessions |
| Timezone corruption in stored data | HIGH | Requires migration: add timezone column, re-process all records using the timezone stored at session creation (if not stored, approximate from system timezone history — lossy) |
| Rate history overwritten (no snapshot) | HIGH | Cannot recover exact historical amounts; must reconstruct from client invoices manually |
| SQLite database corrupted | MEDIUM | Restore from automatic daily backup (if configured); otherwise data loss from last backup |
| Double-counted sessions (no deduplication) | MEDIUM | Identify duplicate sessions by overlapping time windows for same project; merge or delete manually via `tt merge`; add deduplication logic going forward |
| Schema missing `rate_at_time` column | HIGH | Data migration: backfill from project's current rate (inaccurate) or from external source |
| Hook scripts too slow (>100ms) | LOW | Refactor to daemon architecture; no data migration required |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Unreliable Stop/SessionStart hooks | Phase 1: Core architecture (heartbeat + reconciliation) | Kill Claude Code with SIGKILL; verify session is eventually closed by next startup |
| SQLite locking under concurrent terminals | Phase 1: Storage setup (WAL + busy timeout + daemon) | Open 5 terminals simultaneously; verify no SQLITE_BUSY errors in logs |
| Orphaned sessions from crashes | Phase 1: Core architecture (heartbeat + max age cap) | Kill -9 test; verify orphan closed on next session start |
| Idle detection false positives | Phase 2: Idle detection (two-tier thresholds) | Sit inactive 10 minutes; verify soft idle notification; sit inactive 22 minutes; verify pause |
| Double-counting across terminals | Phase 1: Core architecture (TT_TERMINAL_ID + singleton) | Open 3 terminals same project; verify 1 session in DB |
| Timezone/DST corruption | Phase 1: Schema design (UTC millis + IANA zone column) | Change system TZ mid-session; verify correct duration |
| Hook startup latency | Phase 1: Architecture (daemon design) | Benchmark SessionStart hook; verify <100ms P99 |
| Project inference misclassification | Phase 1: Project detection (git root + config file) | Open Claude Code in monorepo subdirectory; verify correct project assigned |
| Disk full / I/O errors | Phase 1: Storage + Phase 4: Operations | Fill disk; verify graceful error and no corruption |
| Rate history corruption | Phase 1: Schema design (rate_at_time column) | Change rate; verify historical sessions unaffected |

---

## Sources

- Claude Code hooks reliability issues (Stop not firing after tool call): https://github.com/anthropics/claude-code/issues/3113
- Claude Code Stop hooks in Skills never fire: https://github.com/anthropics/claude-code/issues/19225
- Hooks stop executing after ~2.5 hours: https://github.com/anthropics/claude-code/issues/16047
- SessionStart not working for new conversations: https://github.com/anthropics/claude-code/issues/10373
- SessionStart hooks blocking CLI startup: https://github.com/anthropics/claude-code/issues/23359
- Claude Code hooks reference documentation: https://code.claude.com/docs/en/hooks
- SQLite concurrent writes and SQLITE_BUSY: https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/
- SQLite WAL mode official documentation: https://sqlite.org/wal.html
- Bun SQLite documentation: https://bun.com/docs/runtime/sqlite
- SQLite performance tuning: https://phiresky.github.io/blog/2020/sqlite-performance-tuning/
- Timewarrior database corruption on disk full: https://github.com/GothenburgBitFactory/timewarrior/issues/155
- Timewarrior no active tracking bug: https://github.com/GothenburgBitFactory/timewarrior/issues/605
- Best practices for database timestamps and timezones: https://www.tinybird.co/blog/database-timestamps-timezones
- Why storing datetimes as UTC isn't enough: https://www.jamesridgway.co.uk/why-storing-datetimes-as-utc-isnt-enough/
- macOS idle time detection (HIDIdleTime): https://xs-labs.com/en/archives/articles/iokit-idle-time/
- Idle Detection API (browser reference, for conceptual framing): https://developer.mozilla.org/en-US/docs/Web/API/Idle_Detection_API
- SIGTERM vs SIGKILL graceful shutdown: https://komodor.com/learn/sigterm-signal-15-exit-code-143-linux-graceful-termination/

---
*Pitfalls research for: CLI time tracking tool with Claude Code hook integration*
*Researched: 2026-02-27*
