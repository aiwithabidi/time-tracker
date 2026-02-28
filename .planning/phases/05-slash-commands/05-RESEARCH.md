# Phase 5: Claude Code Slash Commands - Research

**Researched:** 2026-02-28
**Domain:** Claude Code Custom Skills / Slash Commands
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLCD-01 | `/tt` slash command shows current session status inline in Claude Code | `tt now` CLI output + skill with `!`backtick`` dynamic injection |
| CLCD-02 | `/tt:week` slash command shows weekly report inline | `tt week` CLI output + namespaced skill via subdirectory |
| CLCD-03 | `/tt:note` slash command adds a note to current session | `tt note "$ARGUMENTS"` shell execution in skill content |
| CLCD-04 | `/tt:start` and `/tt:stop` slash commands control tracking | `tt start`/`tt stop` + `disable-model-invocation: true` to prevent auto-trigger |
| CLCD-05 | `/tt:projects` slash command lists projects with hours inline | `tt projects` CLI output via dynamic injection |
| CLCD-06 | `/tt:edit` slash command enables session editing from inside Claude Code | `tt edit $ARGUMENTS` or invoke edit interactively |
| CLCD-07 | All slash commands invoke the compiled `tt` binary and present results formatted for conversation | `!`./dist/tt <subcommand>`` syntax runs binary; output is pre-rendered for Claude |
</phase_requirements>

---

## Summary

Claude Code "slash commands" are now called **Skills** and live in `.claude/skills/<skill-name>/SKILL.md` or the legacy path `.claude/commands/<name>.md`. Both paths work identically — skills are the recommended format as of 2025-2026.

The key mechanism for the `tt` integration is the **dynamic context injection** feature: the `!`command`` syntax (backtick-wrapped shell commands prefixed with `!`) executes shell commands **before** the skill content is sent to Claude. The output replaces the placeholder inline. This means `/tt` can run `./dist/tt now` and embed the live output directly into Claude's prompt — Claude sees actual tracking data, not instructions to fetch it.

Namespaced commands like `/tt:week` are created by naming skill directories as `tt:week` — the directory name (or `name` frontmatter field) becomes the slash command. The colon is valid in skill names. This is confirmed by the GSD tooling in this project which uses `gsd:execute-phase`, `gsd:research-phase`, etc.

**Primary recommendation:** Create skills in `.claude/skills/` using `name: tt:subcommand` frontmatter, with `!`./dist/tt <subcommand>`` for live data injection and `disable-model-invocation: true` on side-effect commands.

---

## Standard Stack

### Core

| Component | Version/Format | Purpose | Why Standard |
|-----------|---------------|---------|--------------|
| `.claude/skills/` directory | Current (2025-2026) | Houses skill SKILL.md files | Official recommended location, replaces `.claude/commands/` |
| `SKILL.md` file | Markdown + YAML frontmatter | Defines the slash command | Required entrypoint for each skill |
| `!`command`` injection | Built-in syntax | Execute shell commands, embed output | Only way to get live data into a skill without Claude running tools |
| `$ARGUMENTS` placeholder | Built-in variable | Capture user-supplied text | Standard argument passing mechanism |
| `disable-model-invocation: true` | Frontmatter field | Prevent Claude from auto-triggering | Required for commands with side effects (start, stop, note, edit) |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `name:` frontmatter | Sets the `/slash-command` name (colon syntax supported) | Always — controls the `/tt:week` etc. name |
| `description:` frontmatter | Helps Claude decide when to auto-load the skill | Omit or use `disable-model-invocation: true` to prevent unwanted auto-triggers |
| `argument-hint:` frontmatter | Shows hint in autocomplete | For commands that take arguments like `/tt:note` |
| `allowed-tools:` frontmatter | Restrict which tools Claude can use | Useful for read-only skills |
| `context: fork` frontmatter | Run skill in isolated subagent | Not needed for simple CLI wrapping; adds latency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `.claude/skills/` | `.claude/commands/` (legacy) | Both work; skills support supporting files and newer features; commands are simpler single-file |
| `!`command`` injection | Ask Claude to run Bash tool | Injection is preprocessing — data is in prompt before Claude starts; Bash tool approach adds a turn and shows tool call in UI |
| Flat skill files | `context: fork` subagent | Fork runs in isolation with no conversation history; adds latency; not needed for simple status display |

**Installation:** No npm packages needed. Skills are plain markdown files.

---

## Architecture Patterns

### Recommended Project Structure

```
.claude/
└── skills/
    ├── tt/
    │   └── SKILL.md        # /tt — current status
    ├── tt:week/
    │   └── SKILL.md        # /tt:week — weekly report
    ├── tt:note/
    │   └── SKILL.md        # /tt:note — add note to current session
    ├── tt:start/
    │   └── SKILL.md        # /tt:start — start tracking
    ├── tt:stop/
    │   └── SKILL.md        # /tt:stop — stop tracking
    ├── tt:projects/
    │   └── SKILL.md        # /tt:projects — list projects
    └── tt:edit/
        └── SKILL.md        # /tt:edit — edit a session
```

Each skill directory name **is** the slash command (after the `/`). The colon in the directory name creates the `:` in the slash command.

### Pattern 1: Read-Only Status Display (with dynamic injection)

**What:** Use `!`./dist/tt <subcommand>`` to inject live CLI output before Claude sees the prompt. Claude then presents the data conversationally.

**When to use:** Any skill that displays current state — `/tt`, `/tt:week`, `/tt:projects`

**Example (`/tt`):**
```yaml
# .claude/skills/tt/SKILL.md
---
name: tt
description: Show current time tracking status. Use when the user wants to see if they are tracking time, which project, or how long today's session has been.
disable-model-invocation: true
---

Current time tracking status from the `tt` CLI:

```
!`./dist/tt now`
```

Present this status to the user. If no session is active, say so clearly.
Do not run any additional commands. The data above is current as of right now.
```

When the user types `/tt`, the `!`./dist/tt now`` executes first, and Claude receives the actual `tt now` output embedded in the prompt.

### Pattern 2: Side-Effect Commands (with disable-model-invocation)

**What:** Commands that write data must use `disable-model-invocation: true` so Claude never auto-triggers them. Arguments are passed via `$ARGUMENTS`.

**When to use:** `/tt:start`, `/tt:stop`, `/tt:note`, `/tt:edit`

**Example (`/tt:note`):**
```yaml
# .claude/skills/tt:note/SKILL.md
---
name: tt:note
description: Add a note to the current time tracking session
argument-hint: "[note text]"
disable-model-invocation: true
---

Add the following note to the current time tracking session:

```
!`./dist/tt note "$ARGUMENTS"`
```

Report the result to the user. If the command succeeded with no output, confirm the note was added. If there was an error, show it clearly.
```

### Pattern 3: Report Display (weekly, projects)

**What:** Same as Pattern 1 but may have optional arguments for filtering.

**Example (`/tt:week`):**
```yaml
# .claude/skills/tt:week/SKILL.md
---
name: tt:week
description: Show this week's time tracking report by project
disable-model-invocation: true
---

Weekly time tracking report:

```
!`./dist/tt week`
```

Present this weekly summary to the user in a readable way. Highlight the total hours and any billable amounts if shown.
```

### Anti-Patterns to Avoid

- **Not using `disable-model-invocation: true` on side-effect skills:** Claude may auto-trigger `/tt:stop` when it thinks work is done. Always set this on start/stop/note/edit.
- **Asking Claude to run `Bash` to get status:** This creates an extra tool-use turn visible in the UI, adds latency, and requires permission approval. Use `!`command`` injection instead.
- **Using `context: fork`:** Forks run in isolated subagent context with no conversation history. Status commands don't benefit from isolation and it adds startup overhead.
- **Hardcoding absolute paths:** Use `./dist/tt` (relative to project root) not `~/.../dist/tt`. The skill runs from the project working directory.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shell command execution in skills | Custom Bash tool invocation pattern | `!`command`` injection syntax | Built-in preprocessing; output is pre-rendered, no tool calls needed |
| Argument passing | Custom parsing logic | `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N` | Built-in substitution; handles all argument passing |
| Namespaced commands | Separate command hierarchies | Directory named `tt:week` | Colon in directory name IS the namespace; confirmed by GSD `gsd:execute-phase` pattern |
| Auto-trigger prevention | Complex guards in skill content | `disable-model-invocation: true` | Single frontmatter field; clean and reliable |

**Key insight:** The `!`command`` injection is the entire bridge between the `tt` binary and Claude. Everything else (argument passing, namespacing, invocation control) is frontmatter configuration.

---

## Common Pitfalls

### Pitfall 1: `!`command`` path resolution

**What goes wrong:** `!`./dist/tt now`` fails because the working directory at skill execution time is not the project root.

**Why it happens:** The `!`command`` runs as a shell command. The working directory is the directory Claude Code was opened from. In most Claude Code sessions this is the project root, but it may vary.

**How to avoid:** Test the command path with `/tt` early. If `./dist/tt` fails, consider using an absolute path or ensuring the binary is in `$PATH` via `tt setup`.

**Warning signs:** Skills execute but return errors like "command not found" or "no such file."

### Pitfall 2: `$ARGUMENTS` with quotes in shell commands

**What goes wrong:** `/tt:note my note with "quotes"` produces a broken shell command when `$ARGUMENTS` is substituted literally.

**Why it happens:** `$ARGUMENTS` is substituted before the shell sees it. If the note text contains quotes or special characters, the shell command breaks.

**How to avoid:** In the skill, use `"$ARGUMENTS"` (quoted) in the backtick command. The `tt note` command itself accepts the note as a positional argument. Test with notes containing spaces and punctuation.

**Warning signs:** Notes with special characters fail silently or produce partial output.

### Pitfall 3: Claude auto-triggering `/tt:stop`

**What goes wrong:** Claude decides tracking should stop at the end of a session and invokes `/tt:stop` automatically.

**Why it happens:** Without `disable-model-invocation: true`, Claude loads the skill's description into context and may choose to invoke it when the description matches.

**How to avoid:** All side-effect commands (`/tt:start`, `/tt:stop`, `/tt:note`, `/tt:edit`) MUST have `disable-model-invocation: true`.

**Warning signs:** Sessions stop unexpectedly; checking `tt log` shows stop times you didn't initiate.

### Pitfall 4: Skill not found after creating files

**What goes wrong:** Creating `SKILL.md` files doesn't immediately show the new slash commands in Claude Code.

**Why it happens:** Skills are loaded at session start. New skills added during a session require a restart to be discovered.

**How to avoid:** Restart Claude Code after creating skill files. (Skills in directories added via `--add-dir` support live reload, but `.claude/skills/` in the project root also supports live change detection per the docs.)

**Warning signs:** `/tt` doesn't appear in autocomplete after file creation.

### Pitfall 5: Output formatting for conversation context

**What goes wrong:** The `tt` binary uses ANSI color codes and box-drawing characters that appear as escape sequences in Claude's context.

**Why it happens:** `!`./dist/tt now`` captures raw stdout including terminal formatting characters.

**How to avoid:** Check if `tt` commands honor a `NO_COLOR` or `--plain` flag. If not, pipe through `sed` to strip ANSI: `` !`./dist/tt now | sed 's/\x1b\[[0-9;]*m//g'` ``. Alternatively, the CLI already uses `chalk` which respects `NO_COLOR=1`.

**Warning signs:** Skill output in Claude's response contains `[33m`, `[0m` or similar escape sequences.

---

## Code Examples

Verified patterns from official sources (code.claude.com/docs/en/slash-commands):

### Complete `/tt` skill (CLCD-01)
```yaml
# .claude/skills/tt/SKILL.md
---
name: tt
description: Show current time tracking status — active session, project, duration, today's total
disable-model-invocation: true
---

Current time tracking status:

```
!`NO_COLOR=1 ./dist/tt now`
```

Present this to the user. Include the project name, running duration, and today's total if shown.
```

### Complete `/tt:week` skill (CLCD-02)
```yaml
# .claude/skills/tt:week/SKILL.md
---
name: tt:week
description: Show this week's time tracking report
disable-model-invocation: true
---

This week's time tracking report:

```
!`NO_COLOR=1 ./dist/tt week`
```

Present the weekly breakdown clearly. Note the total hours and any billable amounts.
```

### Complete `/tt:note` skill (CLCD-03)
```yaml
# .claude/skills/tt:note/SKILL.md
---
name: tt:note
description: Add a note to the current time tracking session
argument-hint: "[note text]"
disable-model-invocation: true
---

Adding note to current session:

```
!`NO_COLOR=1 ./dist/tt note "$ARGUMENTS"`
```

Confirm to the user that the note was added, or show any error if the command failed.
```

### Complete `/tt:start` skill (CLCD-04)
```yaml
# .claude/skills/tt:start/SKILL.md
---
name: tt:start
description: Start a time tracking session for the current project
disable-model-invocation: true
---

Starting time tracking:

```
!`NO_COLOR=1 ./dist/tt start`
```

Confirm the session started, including the project name if shown in the output.
```

### Complete `/tt:stop` skill (CLCD-04)
```yaml
# .claude/skills/tt:stop/SKILL.md
---
name: tt:stop
description: Stop the current time tracking session
disable-model-invocation: true
---

Stopping time tracking:

```
!`NO_COLOR=1 ./dist/tt stop`
```

Confirm the session was stopped and show the duration if provided.
```

### Complete `/tt:projects` skill (CLCD-05)
```yaml
# .claude/skills/tt:projects/SKILL.md
---
name: tt:projects
description: List all known projects with their time totals
disable-model-invocation: true
---

Projects and time totals:

```
!`NO_COLOR=1 ./dist/tt projects`
```

Present the project list to the user.
```

### Complete `/tt:edit` skill (CLCD-06)
```yaml
# .claude/skills/tt:edit/SKILL.md
---
name: tt:edit
description: Edit a past time tracking session by ID
argument-hint: "[session-id]"
disable-model-invocation: true
---

Edit time tracking session $ARGUMENTS.

Run: `NO_COLOR=1 ./dist/tt edit $ARGUMENTS`

If no session ID was provided (ARGUMENTS is empty), first run:

```
!`NO_COLOR=1 ./dist/tt log --limit 5`
```

Show the recent sessions above and ask the user which session ID they want to edit.
Then instruct the user to run `/tt:edit <session-id>` with the specific ID.
```

### Argument indexing example (for multi-argument skills)
```yaml
# Source: code.claude.com/docs/en/slash-commands#pass-arguments-to-skills
---
name: migrate-component
---

Migrate the $ARGUMENTS[0] component from $ARGUMENTS[1] to $ARGUMENTS[2].
# Equivalent shorthand:
Migrate the $0 component from $1 to $2.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.claude/commands/<name>.md` (flat file) | `.claude/skills/<name>/SKILL.md` (directory) | 2025 | Skills support supporting files; commands still work |
| `/command` via subdirectory `commands/gsd/name.md` → `gsd:name` | `name:` frontmatter field or directory named `tt:week` | Same era | Both work; frontmatter `name` field is canonical |
| No shell execution in commands | `!`command`` preprocessing syntax | 2025 | Skills can embed live data without Claude running tools |
| No invocation control | `disable-model-invocation` + `user-invocable` fields | 2025 | Fine-grained control over who triggers a skill |

**Deprecated/outdated:**
- Flat `.claude/commands/name.md` files: Still work, but can't use supporting files, scripts, or some newer frontmatter. Use skills for new work.
- Expecting `$ARGUMENTS` to be quoted automatically: It is not. Shell-quote it yourself in `!`command`` usage.

---

## Open Questions

1. **`NO_COLOR=1` behavior in `tt` binary**
   - What we know: `tt` uses `chalk` which respects `NO_COLOR` environment variable
   - What's unclear: Whether chalk is version 5 (ESM) which auto-detects `NO_COLOR`, or needs explicit flag
   - Recommendation: Test `NO_COLOR=1 ./dist/tt now` in the shell first; if ANSI codes still appear, check chalk version

2. **Binary path for `/tt:edit` interactive flow**
   - What we know: `tt edit` uses `@inquirer/prompts` for interactive editing (from package.json)
   - What's unclear: Interactive prompts won't work in `!`command`` injection context (no TTY)
   - Recommendation: For `/tt:edit`, show recent sessions via injection and ask Claude to invoke `tt edit` as a `Bash` tool call with the specific ID; or design a non-interactive `--field value` flag variant

3. **`tt setup` and PATH**
   - What we know: `tt setup` is implemented (Phase 2) and likely writes to shell profile
   - What's unclear: Whether `tt setup` installs the binary to a PATH location
   - Recommendation: If `tt` is in PATH, use `tt now` instead of `./dist/tt now` in skills for portability

---

## Validation Architecture

> `workflow.nyquist_validation` not present in config.json — skipping test framework section.

---

## Sources

### Primary (HIGH confidence)
- `https://code.claude.com/docs/en/slash-commands` — complete skills/slash commands documentation including frontmatter reference, `!`command`` injection, `$ARGUMENTS`, namespacing, invocation control
- `https://code.claude.com/docs/en/sub-agents` — subagent documentation confirming `context: fork`, `agent:` field, built-in agent types
- `~/.claude/commands/gsd/research-phase.md` — confirmed colon namespace pattern in `name: gsd:research-phase` frontmatter
- `~/.claude/commands/gsd/execute-phase.md` — confirmed `name: gsd:execute-phase`, `argument-hint:`, `allowed-tools:` frontmatter fields in production use

### Secondary (MEDIUM confidence)
- Project `package.json` — confirmed binary is at `dist/tt` via `bun build --compile src/cli/index.ts --outfile dist/tt`
- Project source `src/cli/commands/` — confirmed all required `tt` subcommands exist: `now`, `week`, `note`, `start`, `stop`, `projects`, `edit`
- `~/.claude/commands/tdd.md` — confirmed `description:` frontmatter is the standard first field in existing user commands

### Tertiary (LOW confidence)
- `NO_COLOR=1` behavior with chalk v5: Based on chalk documentation and Node.js conventions; should be verified by running the binary

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from official `code.claude.com` docs fetched 2026-02-28
- Architecture patterns: HIGH — `!`command`` injection, namespacing, and frontmatter fields confirmed from official docs + real-world GSD examples in this user's config
- Pitfalls: MEDIUM — ANSI stripping and interactive TTY limitations are based on general CLI/shell knowledge; path resolution is LOW (environment-dependent)
- Open questions: `tt:edit` interactive flow is a genuine design question requiring a decision before implementation

**Research date:** 2026-02-28
**Valid until:** 2026-05-28 (stable API; skills/slash commands feature is well-established)
