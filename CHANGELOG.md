# Changelog

## [0.2.2] - 2026-03-01

### Added
- GitHub Actions CI pipeline — typecheck, test, build run in parallel on every push/PR
- CI status badge in README
- `CONTRIBUTING.md` — development setup, project structure, code style, contributor guidelines
- GitHub issue templates (bug report, feature request) and PR template
- Auto-Update section in README documenting the update mechanism
- Project Structure section in README
- Development section in README with full workflow commands

### Security
- **Remote origin verification** — `tt update` now verifies the git remote URL matches `github.com/aiwithabidi/time-tracker` before pulling (supply-chain protection)
- **sourceRepo path validation** — Zod schema requires absolute paths, rejecting relative path injection
- **Build rollback** — if pull, install, or build fails during update, automatically resets to the previous commit
- **Per-command timeouts** — git operations 30s, `bun install` 120s, `bun run build` 120s (prevents hangs)
- **Atomic binary replacement** — writes to `.tmp` then renames, preventing corrupt binaries on crash

### Fixed
- Excluded `lifecycle-service.test.ts` from vitest (requires `bun:sqlite` runtime, runs under `bun test` instead)
- Removed unused `saveConfig` import from update command

## [0.2.1] - 2026-03-01

### Added
- `tt logs` command — view command event logs for product analytics
  - `--stats` — usage frequency, avg latency, error rates
  - `--errors` — show only failures
  - `--json` — raw JSON output for AI analysis
  - `-c <command>` — filter by command name
  - `--from / --to` — date range filtering
- `command_events` table — records every CLI invocation with command, args, duration, success/failure, error details, and working directory
- Schema versioning (`~/.tt/schema-version`) — skips DDL on steady-state startup, eliminating exclusive locks from migrations
- WAL size limit (`journal_size_limit = 64MB`) — prevents unbounded WAL growth
- Clean process exit handler for proper WAL checkpointing

### Fixed
- **SQLite concurrency** — resolved `database is locked` errors from concurrent hook processes:
  - `busy_timeout` PRAGMA now set before all others (was set after `journal_mode = WAL`)
  - Switched from `BEGIN IMMEDIATE` to `BEGIN DEFERRED` (rate-limited pulses no longer grab write locks)
  - `start()` and `stop()` writes wrapped in transactions (were bare multi-write sequences)
  - `ensureProjectInDb()` moved inside pulse transaction (was racing outside it)
  - Pulse command retries with jittered backoff (3 retries on lock contention)

### Changed
- Removed 30-day log rotation — all pulse error logs kept permanently for analytics

## [0.2.0] - 2026-02-28

### Added
- `tt version` command — show installed version and update status
- `tt update` command — pull latest, preview changelog, rebuild, install
- Background update check via SessionStart hook (non-blocking, 1hr throttle)
- Statusline indicator when update is available (`⬆ tt update`)
- Skills installed globally by `tt setup` (work from any project directory)
- `sourceRepo` tracked in config for update mechanism
- `CHANGELOG.md` for tracking changes

### Fixed
- Auto-restart after `tt stop` — 60s cooldown prevents SessionStart hook from immediately restarting a stopped session

### Changed
- `tt setup` now auto-patches `~/.claude/settings.json` (no more manual JSON merging)
- `tt setup` writes `check-update.js` hook to `~/.tt/hooks/`
- Version bumped from `0.1.0` to `0.2.0`

## [0.1.0] - 2026-02-15

### Added
- Initial release
- `tt start`, `tt stop`, `tt now`, `tt today`, `tt week`
- `tt log`, `tt last`, `tt projects`, `tt export csv`
- `tt note`, `tt tag`, `tt away`, `tt back`
- `tt edit`, `tt undo`, `tt split`, `tt merge`
- `tt alias`, `tt rate`, `tt review`
- `tt setup` with Claude Code hooks
- `tt pulse` heartbeat system
- Idle detection (soft/hard)
- Project resolution (alias > git root)
- SQLite storage with WAL mode
