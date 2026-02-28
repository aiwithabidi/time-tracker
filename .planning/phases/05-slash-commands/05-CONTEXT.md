# Phase 5: Claude Code Slash Commands — Context

**Phase goal:** Users can check tracking status and control sessions without leaving the Claude Code conversation.

## Requirements

| ID | Description |
|----|-------------|
| CLCD-01 | `/tt` shows current session status inline |
| CLCD-02 | `/tt:week` shows weekly report inline |
| CLCD-03 | `/tt:note` adds a note to current session |
| CLCD-04 | `/tt:start` and `/tt:stop` control tracking |
| CLCD-05 | `/tt:projects` lists projects with hours |
| CLCD-06 | `/tt:edit` enables session editing |
| CLCD-07 | All slash commands invoke the compiled `tt` binary |

## Success Criteria

1. Typing `/tt` displays current session project, duration, and today's total inline
2. Typing `/tt:week` displays a formatted weekly report inline
3. Typing `/tt:note "description"` adds a note; appears in subsequent `tt log`
4. Typing `/tt:start` or `/tt:stop` starts/stops tracking with confirmation
5. All slash commands invoke the compiled `tt` binary and return formatted results

## Architecture Decision

**Skills (not legacy commands):** Use `.claude/skills/<name>/SKILL.md` format — the current recommended approach for Claude Code custom slash commands.

**`!`command`` injection:** Shell commands in backticks prefixed with `!` execute as preprocessing before Claude sees the content. This embeds live `tt` output directly into the prompt — no extra tool call turn.

**`NO_COLOR=1`:** The `tt` binary respects `NO_COLOR` env var (checked in `src/cli/format.ts:isColorEnabled()`), stripping ANSI codes for clean text output in skill context.

**`disable-model-invocation: true`:** Required on all skills to prevent Claude from auto-triggering them. Especially critical on side-effect commands (start, stop, note, edit).

## Key Design Decisions

- `tt edit` is already non-interactive (uses `--start`, `--end`, `--project`, `--note`, `--tag`, `--untag` flags), so `/tt:edit` can guide Claude to invoke it via Bash tool with specific flags
- Binary path uses `./dist/tt` (relative to project root where Claude Code runs)
- All 7 skills use `disable-model-invocation: true` to prevent unwanted auto-triggers
