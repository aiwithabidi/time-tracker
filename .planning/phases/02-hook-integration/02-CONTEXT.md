# Phase 2: Hook Integration - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Claude Code lifecycle hooks, activity pulses, idle detection, and startup reconciliation. Time tracking starts and stops automatically as Claude Code sessions begin and end, with idle time correctly excluded. Manual CLI commands (`tt away`/`tt back`) provide intentional break support. Hook scripts are thin shell wrappers; all logic lives in the compiled `tt` binary.

</domain>

<decisions>
## Implementation Decisions

### Hook Architecture
- Hooks are fire-and-forget signals — SQLite is the source of truth for session state
- All heartbeat hooks (PostToolUse, Stop) use `async: true` — never block Claude
- SessionStart runs synchronously but must complete in <100ms
- Shell scripts stored at `~/.tt/hooks/` alongside the database
- Every hook script starts with `INPUT=$(cat)` to consume stdin (prevents Claude deadlock)
- Stop hook must check `stop_hook_active` to prevent infinite loops
- Error output suppressed with `2>/dev/null` — hooks are observational only

### Hook Configuration
- Hooks configured in `~/.claude/settings.json` (global, not per-project)
- SessionStart matcher: `startup` and `resume` (not `clear` — user is starting fresh)
- PostToolUse: no matcher (fires on all tool uses) with `async: true`
- Stop: no matcher with `async: true`

### Pulse Rate Limiting
- Rate limit: 1 pulse write per 60 seconds per terminal
- Rate limiting logic lives inside `tt pulse` command, not shell scripts
- Shell scripts have no persistent state between invocations
- If rate-limited, exit 0 silently — not an error

### Session Auto-Start (Handling Unreliable SessionStart)
- SessionStart hook (#10373) is unreliable on new sessions — first PostToolUse must compensate
- `tt pulse` auto-creates a session if no active session exists for the resolved project
- Source field distinguishes: `claude-startup`, `claude-resume`, `post-tool-use`, `stop`, `manual`

### Idle Detection
- Pure stateless computation: compare last pulse timestamp to current time
- Soft idle: ~8 minutes (informational only, shown in `tt now`)
- Hard idle: ~20 minutes (auto-pause, deducts idle time from session)
- Auto-resume on next pulse: compute idle gap, add to `idleDeductedMs`, clear pause
- No daemon or timer needed — idle detection runs on-demand during `tt pulse` and `tt now`

### Away/Back
- `tt away`: marks intentional break (sets `pausedAt` timestamp on session)
- `tt back`: computes break duration, adds to `idleDeductedMs`, clears `pausedAt`
- If pulse arrives while away, auto-resume (same as `tt back`)

### Schema Changes
- Add `pausedAt` column to sessions table (nullable integer, UTC milliseconds)
- Migration via ALTER TABLE ADD COLUMN (safe for SQLite, column is nullable)

### TT_TERMINAL_ID
- Use `TT_TERMINAL_ID` env var if set
- Fallback: `pid-{process.pid}` (same as Phase 1)
- Shell hooks pass terminal ID from env to `tt pulse --terminal-id`

</decisions>

<specifics>
## Specific Ideas

- **Graceful degradation**: If all hooks fail, `tt start`/`tt stop` still work manually — hooks add convenience, not correctness
- **Startup reconciliation**: On any `tt pulse` or `tt start`, check for stale sessions from previous Claude sessions and auto-close them (existing logic in session-service.ts)
- **Diagnostics**: `tt now` should show idle state and last pulse time when hooks are active — helps user verify hooks are working
- **Installation**: A `tt setup` or `tt hooks install` command that writes hook scripts and prints the required settings.json additions (not auto-editing settings.json — too risky)

</specifics>

<deferred>
## Deferred Ideas

- PreToolUse hooks (start with PostToolUse only — confirmed activity)
- UserPromptSubmit as fallback for SessionStart (add if #10373 proves problematic)
- SessionEnd event (newer, less documented — research further)
- launchd plist for periodic idle check (add only if on-demand detection is insufficient)
- Hook health monitoring in `tt now` output (Phase 3 reporting)

</deferred>

---

*Phase: 02-hook-integration*
*Context gathered: 2026-02-28*
