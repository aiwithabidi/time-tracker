# Changelog

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
