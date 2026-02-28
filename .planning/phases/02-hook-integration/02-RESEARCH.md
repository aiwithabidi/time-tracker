# Phase 2: Hook Integration - Research

**Researched:** 2026-02-28
**Domain:** Claude Code hooks system — lifecycle, payload schema, reliability, shell script patterns
**Confidence:** HIGH (sourced directly from official docs and GitHub issue tracker)

## Summary

Claude Code's hook system is a mature but actively-developed feature with a well-defined JSON protocol for stdin/stdout communication and a clear lifecycle model. For a time tracker that needs fire-and-forget heartbeat pulses on tool events, the system is fit for purpose — but with important architectural implications that must be designed around.

The most critical finding is that **`SessionStart` and `Stop` are both unreliable in specific scenarios** (detailed below), which means the time tracker cannot depend on them for correctness. The system must be designed with heartbeat-driven lifecycle as the source of truth (AUTO-05), with hooks as supplementary signals only. This is already the correct design per the requirements — hooks fire pulses, idle detection handles the actual session boundary.

For the `<100ms` constraint (AUTO-03), the `async: true` flag on `PostToolUse` / `PreToolUse` hooks is the correct mechanism. Async hooks fire in the background without blocking Claude's response loop, making the timing constraint trivially achievable. The compiled `tt` binary handles the actual pulse write.

**Primary recommendation:** Use `async: true` on all heartbeat hooks (PreToolUse/PostToolUse) so they never block Claude. Use SessionStart synchronously but treat it as best-effort. Do NOT rely on Stop as the session-end signal — use it only as an opportunistic final pulse.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTO-01 | Claude Code SessionStart hook auto-starts/attaches session | SessionStart event documented; known reliability issue with new conversations (issue #10373, workaround: also handle via UserPromptSubmit) |
| AUTO-02 | Claude Code Stop hook fires final pulse | Stop event documented; unreliable when Claude stops after tool use (fixed in v1.0.45); design must not depend on Stop for correctness |
| AUTO-03 | Hook scripts execute in <100ms | Use `async: true` on command hooks — hooks run in background without blocking; sync hooks have 600s default timeout but block Claude |
| AUTO-04 | Activity pulses on tool use, rate-limited 1/60s per terminal | PreToolUse or PostToolUse with `async: true`; rate limiting implemented in `tt pulse` subcommand |
| AUTO-05 | Sessions use heartbeat-based lifecycle, not Stop-hook-dependent | Confirms heartbeat architecture is correct — hooks are inputs, not the source of truth |
| AUTO-06 | Stale sessions auto-closed on next SessionStart | SessionStart hook calls `tt session reconcile` which closes sessions with no recent pulses |
| IDLE-01 | Soft idle at ~8 minutes with no pulses | IdleDetector reads pulse timestamps from DB; no hook involvement |
| IDLE-02 | Hard auto-pause at ~20 minutes with no pulses | Same as IDLE-01 |
| IDLE-03 | Auto-resume on next activity pulse | PostToolUse pulse triggers resume check in IdleDetector |
| IDLE-04 | Idle time tracked in idle_deducted_ms | Schema already supports this (Phase 1); populated by IdleDetector |
| IDLE-05 | `tt away` / `tt back` manual break commands | CLI commands; no hook involvement |
</phase_requirements>

---

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Claude Code hooks | Current | Lifecycle event delivery to shell scripts | Only mechanism for integrating with Claude Code session events |
| `jq` | System-installed | JSON parsing in shell scripts | Standard tool for hook JSON; documented in official examples |
| Compiled `tt` binary | Local | Receives hook signals, writes pulses | Bun compiled binary; single process for all DB writes |

### Configuration Locations

| Location | Scope | Use Case |
|----------|-------|----------|
| `~/.claude/settings.json` | All projects | Time tracker hooks — must be global since `tt` tracks across all projects |
| `.claude/settings.json` | Per project | NOT used for tt hooks — tt is cross-project |

### Supporting

| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| `bash` | System | Hook shell script wrapper | Minimal wrapper: read stdin, call `tt pulse` |
| `TT_TERMINAL_ID` env var | Custom | Session deduplication | Set by SessionStart hook, read by all subsequent hooks |

---

## Architecture Patterns

### Hook Configuration Schema

The full settings.json hook structure (verified from official docs):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/hook-script.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/pulse-hook.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/stop-hook.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Key schema facts (HIGH confidence, from official docs):**
- Outer array: matcher groups (one object per matcher pattern)
- Inner `"hooks"` array: one or more handlers per matcher group
- `"matcher"` is a regex string; omit or use `""` to match all occurrences
- `"async": true` makes the hook fire-and-forget (only valid on `type: "command"`)
- `"timeout"`: seconds before canceling (default: 600 for sync command hooks)
- All matching hooks from all groups run **in parallel**

### Common Input Fields (All Hook Events)

All hooks receive this JSON on stdin:

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../transcript.jsonl",
  "cwd": "/Users/titan/my-project",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse"
}
```

| Field | Value | Use in tt |
|-------|-------|-----------|
| `session_id` | Unique session string | Tag pulses with Claude session ID for correlation |
| `cwd` | Working directory when hook fired | Project inference fallback |
| `hook_event_name` | Which event fired | Set `source` field on pulse record |
| `transcript_path` | Path to conversation JSONL | Not needed for tt |

### SessionStart Input (Additional Fields)

```json
{
  "session_id": "abc123",
  "cwd": "/Users/titan/my-project",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-sonnet-4-6"
}
```

| `source` Matcher | When It Fires |
|------------------|---------------|
| `startup` | New session |
| `resume` | `--resume`, `--continue`, `/resume` |
| `clear` | `/clear` command |
| `compact` | Auto or manual compaction |

**For tt:** Match on `startup` and `resume` to auto-start/attach. Match `compact` to re-attach after compaction (session continues). Skip `clear` (user is starting fresh).

### PostToolUse Input (Additional Fields)

```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": { "file_path": "/path/to/file.txt", "content": "..." },
  "tool_response": { "filePath": "/path/to/file.txt", "success": true },
  "tool_use_id": "toolu_01ABC123..."
}
```

**For tt heartbeats:** Only `cwd` and `session_id` are needed. Read the full input, ignore the rest, call `tt pulse --source hook`.

### Stop Input (Additional Fields)

```json
{
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "I've completed the refactoring..."
}
```

**CRITICAL:** Check `stop_hook_active` to avoid infinite loops. If `true`, exit 0 immediately.

### PreToolUse vs PostToolUse for Heartbeats

| Hook | When | Recommended For tt |
|------|------|--------------------|
| PreToolUse | Before tool runs | Not ideal — could fire on blocked tools |
| PostToolUse | After tool succeeds | Preferred — confirms real activity happened |

Use PostToolUse for activity pulses. It fires after confirmed tool execution.

### Thin Shell Wrapper Pattern

The recommended pattern for tt hooks — minimal shell that delegates to binary:

```bash
#!/bin/bash
# ~/.tt/hooks/post-tool-use.sh
# Thin wrapper: reads stdin, calls tt binary, exits fast
# Uses async: true in settings.json so this never blocks Claude

# Read and discard stdin (required — Claude Code hangs if stdin isn't consumed)
INPUT=$(cat)

# Extract fields needed for pulse
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

# Call compiled binary — non-blocking write to SQLite
exec /usr/local/bin/tt pulse \
  --source "post-tool-use" \
  --session-id "$SESSION_ID" \
  --cwd "$CWD" \
  2>/dev/null

# exec replaces shell process with tt — no subshell overhead
```

**Why `exec`:** Replaces the shell process entirely with the binary. Eliminates one process layer and ensures the binary's exit code is the hook's exit code.

**Why consume stdin:** Claude Code hangs if a hook script doesn't read from stdin when JSON is sent. Always `INPUT=$(cat)` even if you don't use it.

**Why `2>/dev/null`:** Hook errors written to stderr appear in Claude's output or verbose log. For fire-and-forget pulses, suppress errors to avoid noise.

### SessionStart Hook Pattern

```bash
#!/bin/bash
# ~/.tt/hooks/session-start.sh
# Synchronous — runs before Claude starts, but kept fast (<100ms target)

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')

# Auto-start or attach to tracking session for this project
# Also closes stale sessions (startup reconciliation)
/usr/local/bin/tt session auto-start \
  --source "claude-$SOURCE" \
  --session-id "$SESSION_ID" \
  --cwd "$CWD" \
  2>/dev/null

exit 0  # Never exit non-zero — would show error to user
```

### Stop Hook Pattern (Final Pulse Only)

```bash
#!/bin/bash
# ~/.tt/hooks/stop.sh
# Fire final pulse on Claude response end
# Treat as best-effort: design assumes this may not fire

INPUT=$(cat)

# Prevent infinite loop — if stop hook is already active, allow stop
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

/usr/local/bin/tt pulse \
  --source "stop" \
  --session-id "$SESSION_ID" \
  --cwd "$CWD" \
  2>/dev/null

exit 0  # Always allow Claude to stop — tt Stop hook is observational only
```

### Async Hook Declaration (Performance Pattern)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.tt/hooks/post-tool-use.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

With `async: true`, Claude Code fires the hook and immediately continues. The 100ms constraint (AUTO-03) is trivially satisfied because Claude never waits for the hook.

**Tradeoff:** Async hooks cannot block or return decisions. This is fine for tt — pulses are fire-and-forget.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async hook execution | Custom background process manager | `"async": true` field on hook | Built into Claude Code; handles lifecycle, cleanup, timeout |
| JSON parsing in shell | Custom awk/sed parser | `jq` | jq is standard; Claude Code docs use it throughout |
| Hook configuration UI | Custom editor | `/hooks` menu in Claude Code | Built-in interactive hook manager |
| Session ID tracking | Custom UUID generation | `session_id` from hook input | Claude provides unique session ID in all hook payloads |
| Stop hook infinite loop prevention | Complex state tracking | `stop_hook_active` field check | Claude Code provides this flag; just check and exit 0 |

---

## Common Pitfalls

### Pitfall 1: Stop Hook Infinite Loop

**What goes wrong:** Stop hook exits with `{"decision": "block"}` or non-zero, causing Claude to re-enter the loop. Next Stop hook fires. Infinite loop.

**Why it happens:** Stop hook blocks Claude, Claude responds again, Stop fires again.

**How to avoid:** ALWAYS check `stop_hook_active` field first. If `true`, exit 0 unconditionally. For tt, never block Claude's stop — only fire a pulse and allow stop.

**Warning signs:** Claude appears to be "stuck" or keeps adding "I've finished" messages repeatedly.

```bash
# Mandatory pattern for all Stop hooks
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi
```

### Pitfall 2: Stdin Not Consumed

**What goes wrong:** Claude Code hangs. The hook appears to never complete.

**Why it happens:** Claude Code sends JSON to stdin. If the hook doesn't read it, the pipe blocks. Claude waits for the hook to finish. Deadlock.

**How to avoid:** Always start every hook script with `INPUT=$(cat)` even if you don't use it.

### Pitfall 3: Shell Profile Polluting Stdout

**What goes wrong:** `~/.zshrc` has `echo "Shell ready"` or similar. Claude Code tries to parse hook output as JSON. Fails with "JSON validation failed."

**Why it happens:** Claude Code spawns a non-interactive shell that sources `.zshrc`. Any `echo` in the profile goes to stdout, which Claude Code reads as hook output.

**How to avoid:** Guard all echo statements in `~/.zshrc`/`~/.bashrc`:
```bash
if [[ $- == *i* ]]; then
  echo "Shell ready"  # Only in interactive shells
fi
```

**Warning signs:** "JSON validation failed" error in Claude Code output even though your hook script is correct.

### Pitfall 4: SessionStart Not Firing on New Sessions (Known Bug)

**What goes wrong:** SessionStart hook doesn't execute when opening a brand-new Claude Code session. It works after `/clear` or `/compact` but not on first open.

**Why it happens:** GitHub issue #10373 (OPEN as of 2026-02-28). The `qz()` function that processes SessionStart hooks is not called for new interactive sessions in Claude Code v2.0.27+.

**How to avoid:** Two mitigations:
1. Use `UserPromptSubmit` as a fallback startup signal (fires on first user message)
2. Design tt to not require the SessionStart hook for correctness — the hook fires a pulse, and idle detection handles the rest

**Workaround status:** Running `/clear` at session start triggers the hook. Not user-friendly.

**Impact on tt:** SessionStart is AUTO-01. Design: if SessionStart doesn't fire, the first `PostToolUse` pulse will auto-start the session via startup reconciliation in `tt pulse`. Eventual consistency, not immediate.

### Pitfall 5: Stop Hook Not Firing After Tool Use

**What goes wrong:** Stop hook never fires when Claude completes a response that ended with a tool call.

**Why it happens:** GitHub issue #3113, fixed in Claude Code v1.0.45 (July 2025). Likely fixed in current versions but version pinning is not enforced in Claude Code.

**How to avoid:** Design does not depend on Stop hook for correctness (AUTO-05). Final pulse from Stop is opportunistic only.

### Pitfall 6: Hooks Capture Snapshot at Startup

**What goes wrong:** You edit `~/.claude/settings.json` while Claude Code is running. Hooks don't update. Old configuration continues running.

**Why it happens:** Claude Code captures a hooks snapshot at startup for security. External edits require review in `/hooks` menu before taking effect.

**How to avoid:** Restart Claude Code session or use `/hooks` menu to reload after any settings change. During tt development, restart Claude between hook script iterations.

### Pitfall 7: ~/.claude/hooks.log Growing Unbounded

**What goes wrong:** Hooks stop firing silently after hours of use. No error messages.

**Why it happens:** GitHub issue #16047. The hooks.log file grew to ~48GB, causing silent failures when logging attempted writes.

**How to avoid:** Add log rotation to hook scripts. Monitor `~/.claude/hooks.log` size. If hooks stop working, `rm ~/.claude/hooks.log`.

```bash
# At end of hook scripts that might log
# Rotate if >50MB
LOG=~/.tt/hooks.log
if [ -f "$LOG" ] && [ $(stat -f%z "$LOG" 2>/dev/null || stat -c%s "$LOG" 2>/dev/null || echo 0) -gt 52428800 ]; then
  mv "$LOG" "${LOG}.old"
fi
```

### Pitfall 8: Hooks Non-Functional in Subdirectories (Fixed, Monitor)

**What goes wrong:** All hooks stop working when Claude Code runs from a subdirectory.

**Why it happens:** GitHub issue #10367, Claude Code v2.0.27 regression. Fixed in v2.0.30, then regressed in v2.0.31 (#10814).

**How to avoid:** This has been a recurring regression point. If hooks stop working entirely, check Claude Code version and open issues. Use `claude --debug` to see hook matching in the logs.

---

## Code Examples

All examples verified from official Claude Code documentation (code.claude.com/docs/en/hooks).

### Complete settings.json for tt (Global, ~/.claude/settings.json)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "~/.tt/hooks/session-start.sh",
            "timeout": 10,
            "statusMessage": "Starting time tracker..."
          }
        ]
      },
      {
        "matcher": "resume",
        "hooks": [
          {
            "type": "command",
            "command": "~/.tt/hooks/session-start.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.tt/hooks/post-tool-use.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.tt/hooks/stop.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Minimal Pulse Hook (post-tool-use.sh)

```bash
#!/bin/bash
# ~/.tt/hooks/post-tool-use.sh
# Fire-and-forget activity pulse. async: true in settings.json.
# Never blocks Claude. Never exits non-zero (error suppressed).
set -euo pipefail

INPUT=$(cat)  # Always consume stdin
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

exec /usr/local/bin/tt pulse \
  --source "post-tool-use" \
  --session-id "$SESSION_ID" \
  --cwd "$CWD" \
  2>/dev/null || true
```

### Rate-Limit Guard (inside tt pulse subcommand)

Rate limiting must happen inside the `tt` binary, not in the shell script — shell scripts have no persistent state between invocations.

```typescript
// Inside tt pulse command handler
const RATE_LIMIT_SECONDS = 60;
const terminalId = process.env.TT_TERMINAL_ID ?? generateTerminalId();

const lastPulse = await db.query.activityPulses.findFirst({
  where: and(
    eq(activityPulses.terminalId, terminalId),
    gte(activityPulses.createdAt, Date.now() - RATE_LIMIT_SECONDS * 1000)
  ),
  orderBy: desc(activityPulses.createdAt),
});

if (lastPulse) {
  // Rate limited — exit 0 silently
  process.exit(0);
}

// Write pulse
await db.insert(activityPulses).values({
  sessionId: resolvedSessionId,
  terminalId,
  source: options.source,
  createdAt: Date.now(),
});
```

### Exit Code Behavior Reference

| Exit Code | Effect | Use For |
|-----------|--------|---------|
| 0 | Success. Claude Code may parse stdout for JSON output. | All tt hooks — always allow |
| 2 | Blocking error. stderr is fed to Claude as feedback. | NOT used by tt hooks |
| Other | Non-blocking error. stderr shown in verbose mode only. | Not intentionally used |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline shell scripts in JSON string | Separate `.sh` files referenced by path | Current best practice | Easier to test, chmod, version-control |
| Blocking hooks for all use cases | `async: true` for fire-and-forget | Feature exists in current docs | Heartbeat hooks never block Claude |
| Single `Stop` hook for session end | Heartbeat-based lifecycle (no Stop dependency) | Recommended after reliability issues | Correct architecture for tt |
| `$HOME` paths in hook commands | Absolute paths or `$CLAUDE_PROJECT_DIR` | Current docs | Prevents path resolution errors |
| `PreToolUse` for all hook types | `PostToolUse` for activity signals | Best practice | Confirmed real activity vs. blocked tools |
| `SessionStart` for all session signals | `SessionEnd` event also available | Recently added | Can use SessionEnd for cleanup, not just Stop |

**Newly discovered event:** `SessionEnd` fires when the Claude Code session terminates. This is distinct from `Stop` (which fires when Claude finishes a response). `SessionEnd` is potentially more reliable as a "user closed Claude Code" signal.

| Event | When | Reliability | Use for tt |
|-------|------|-------------|------------|
| `Stop` | Claude finishes responding | Intermittent (fixed in v1.0.45) | Final pulse — async, best-effort |
| `SessionEnd` | Claude Code process exits | Not well-documented in issues | Potential final pulse — research further |

---

## Known Reliability Issues Summary

| Issue | GitHub # | Status | Impact on tt | Mitigation |
|-------|----------|--------|--------------|------------|
| SessionStart not firing on new sessions | #10373 | OPEN | AUTO-01 partial miss | UserPromptSubmit fallback; heartbeat compensates |
| Stop hook not firing after tool use | #3113 | Fixed v1.0.45 | AUTO-02 historical | Likely fixed; design doesn't depend on it |
| Hooks stop after ~2.5h (48GB log) | #16047 | Closed (user fix) | All hooks affected | Monitor log size; rotate at 50MB |
| Hooks non-functional in subdirectories | #10367 | Fixed v2.0.30 | All hooks affected | Monitor; recurring regression pattern |
| Hooks require --debug flag | #10401 | Was v2.0.27 regression | All hooks affected | Fixed; current versions unaffected |
| Stop hooks in skills never fire | #19225 | Closed not-planned | n/a (not using skills) | Not applicable — tt uses settings.json |
| SessionStart breaks stdin on Windows | #23359 | Closed duplicate | macOS only | Not applicable |
| Hooks broken in v2.0.31 | #10814 | Fixed v2.0.30→regression→refix | All hooks | Monitor Claude Code version |

**Key insight:** Reliability issues cluster around two areas: (1) SessionStart not firing reliably, and (2) the `~/.claude/hooks.log` file growing unbounded. Both are addressable with the right architecture and operational hygiene.

---

## Open Questions

1. **SessionEnd vs Stop — Which is more reliable as a final pulse signal?**
   - What we know: SessionEnd fires when Claude Code process exits; Stop fires when Claude finishes a response
   - What's unclear: Are SessionEnd hooks reliably fired on Ctrl+C / force quit? Has SessionEnd had the same regression issues as Stop?
   - Recommendation: Implement Stop (async) for activity marker; add SessionEnd as belt-and-suspenders for session close; test both manually during Phase 2 implementation

2. **TT_TERMINAL_ID persistence between hooks**
   - What we know: Each hook invocation is a fresh shell. Environment variables don't persist between hook calls unless set via CLAUDE_ENV_FILE (SessionStart only).
   - What's unclear: The best mechanism to pass a stable terminal ID from SessionStart to PostToolUse hooks
   - Recommendation: Write terminal ID to `~/.tt/terminals/{session_id}` file on SessionStart; read it in PostToolUse hooks. File I/O is fast (<1ms) and avoids env var complexity.

3. **PreToolUse for "typing" detection**
   - What we know: PreToolUse fires before tool execution; PostToolUse fires after
   - What's unclear: Whether PreToolUse + PostToolUse together provide more granular activity detection than PostToolUse alone
   - Recommendation: Start with PostToolUse only for simplicity (confirmed activity). Add PreToolUse in a later iteration if pulse granularity is insufficient.

---

## Validation Architecture

> Skipped: workflow.nyquist_validation is not set to true in .planning/config.json

---

## Sources

### Primary (HIGH confidence)
- [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) — Full hook reference: event schemas, configuration format, JSON input/output, exit codes, async hooks, all event types
- [code.claude.com/docs/en/hooks-guide](https://code.claude.com/docs/en/hooks-guide) — Hook guide: practical examples, thin shell wrappers, troubleshooting

### Secondary (MEDIUM confidence — GitHub issues, closed/resolved)
- [github.com/anthropics/claude-code/issues/3113](https://github.com/anthropics/claude-code/issues/3113) — Stop hook not firing after tool use (fixed v1.0.45)
- [github.com/anthropics/claude-code/issues/16047](https://github.com/anthropics/claude-code/issues/16047) — Hooks stop after ~2.5h due to 48GB log file (user-resolved)

### Tertiary (MEDIUM confidence — GitHub issues, open/unresolved)
- [github.com/anthropics/claude-code/issues/10373](https://github.com/anthropics/claude-code/issues/10373) — SessionStart not firing on new sessions (OPEN, v2.0.27+)
- [github.com/anthropics/claude-code/issues/10367](https://github.com/anthropics/claude-code/issues/10367) — Hooks non-functional in subdirectories (fixed v2.0.30)
- [github.com/anthropics/claude-code/issues/10814](https://github.com/anthropics/claude-code/issues/10814) — Hooks broken in v2.0.31 (regression after fix)
- [github.com/anthropics/claude-code/issues/19225](https://github.com/anthropics/claude-code/issues/19225) — Stop hooks in skills never fire (closed not-planned)
- [github.com/anthropics/claude-code/issues/23359](https://github.com/anthropics/claude-code/issues/23359) — SessionStart breaks stdin on Windows (closed duplicate)

---

## Metadata

**Confidence breakdown:**
- Hook configuration schema: HIGH — directly from official docs with complete JSON examples
- Event types and payloads: HIGH — official docs list all fields and schemas
- Reliability issues: HIGH — confirmed from GitHub issue tracker with version numbers and resolutions
- Shell script patterns: HIGH — derived from official example patterns
- Performance characteristics: MEDIUM — async: true is documented as non-blocking; actual timing measured at implementation

**Research date:** 2026-02-28
**Valid until:** 2026-05-01 (Claude Code releases frequently; recheck before Phase 2 implementation if >4 weeks away)
