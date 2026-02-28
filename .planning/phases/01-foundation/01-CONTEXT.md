# Phase 1: Foundation - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

SQLite schema, repository layer, project inference, and manual start/stop/status commands. Users can manually track time against projects with accurate, billing-safe data from the first session. Multiple concurrent sessions are supported (user works across multiple projects simultaneously). Hook-based automation, reporting, and session correction are separate phases.

</domain>

<decisions>
## Implementation Decisions

### CLI Output Style
- Minimal one-liner format for all commands (not multi-line blocks)
- Colored output optimized for dark terminals; auto-strip colors when piped (TTY detection); respect NO_COLOR env var
- Compact time format: "2h 15m" — omit zero components ("45m" not "0h 45m")
- Unicode symbol prefix on output lines for visual anchoring (e.g. `▶`, `■`, `○`)
- Project names displayed as short slugs from config; fallback to directory basename if no slug configured
- Natural language error messages (not prefixed "error:"), always include suggested next command
- Confirmation line on `tt start` and `tt stop` — never silent on success

### Start Command Behavior
- `tt start` shows project name + source hint: `▶ Started time-tracker (git)` — teaches how inference works
- Idempotent: running `tt start` when already tracking the same project shows current status instead of erroring — `▶ time-tracker  1h 32m`
- Stale session recovery: auto-close stale sessions from crashes transparently — `Closed stale session (2h 15m from yesterday). ▶ Started time-tracker`
- Multiple concurrent sessions: `tt start` in a different project directory starts a new session without stopping existing ones

### Stop Command Behavior
- Shows duration only: `■ Stopped time-tracker — 1h 32m`
- Silent about other running sessions (no nudge)
- `tt stop` scoping and `tt stop` with no active session: Claude's discretion

### `tt now` Display
- One-liner when tracking: project + duration + today's total
- When not tracking: show today's summary — `○ No active session (today: 3h 45m across 2 sessions)`
- Multi-session display: Claude's discretion (stacked one-liners vs primary + footnote)

### Project Inference
- Primary: git root detection (basename of git root = project name)
- Non-git fallback: interactive prompt for project name
- Source hint shown in start confirmation: `(git)`, `(dir)`, `(alias)`, `(prompt)`
- Alias override priority and save-on-prompt behavior: Claude's discretion

### Tags
- Single-word kebab-case format (no multi-word with quotes)
- Freeform vs predefined set: Claude's discretion
- Multi-tag in one command and tagging at start time: Claude's discretion

### Notes
- Multiple notes per session (append model, not overwrite)
- Each note stored with timestamp for chronological context

### Error Recovery
- Fuzzy project name matching: suggest closest match on typo — `✗ Unknown project 'tim-tracker'. Did you mean 'time-tracker'?`
- Every error message includes a suggested next command — never leaves user stuck
- Help output style: Claude's discretion

### Storage
- Database and config stored in `~/.tt/` directory
- `~/.tt/tt.db` for SQLite database
- `~/.tt/config.json` for project config (JSON format — matches Claude Code conventions)
- Database auto-created silently on first use — no `tt init` required

### Claude's Discretion
- Stop behavior: exit code when no active session, stop scope from any directory
- `tt now` multi-session layout choice
- Alias priority (override git or fallback only) and prompt-save behavior
- Tag implementation: freeform vs predefined, multi-tag syntax, start-time tagging
- Help output format
- Loading skeleton and exact spacing/typography
- Unicode symbol choices for each state (started, stopped, no session, error)

</decisions>

<specifics>
## Specific Ideas

- **Personality**: Friendly productivity companion, not terse Unix tool. Like bun — informative, not intimidating. User is learning development, so output should teach through usage.
- **Claude Code seamlessness**: tt should feel like a natural extension of Claude Code. Copy conventions, output style, and interaction patterns from Claude Code where possible. JSON config format chosen to match Claude Code's settings.json approach.
- **Working style**: User works on multiple projects simultaneously with terminals open. Having a terminal open doesn't mean work stopped — sessions persist until explicitly stopped or idle-detected in Phase 2.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-27*
