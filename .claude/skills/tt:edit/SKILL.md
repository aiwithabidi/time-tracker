---
name: tt:edit
description: Edit a past time tracking session
argument-hint: "<session-id> [--start HH:mm] [--end HH:mm] [--project slug] [--note text] [--tag name]"
disable-model-invocation: true
---

Edit result:

!`NO_COLOR=1 ./dist/tt edit $ARGUMENTS 2>&1`

Recent sessions for reference:

!`NO_COLOR=1 ./dist/tt log --from today 2>&1`

If the edit command above succeeded, confirm the changes to the user.

If the edit command above failed (e.g., "Session ID required" or "No changes specified"), show the recent sessions list and guide the user. They should re-invoke with: `/tt:edit <session-id> --start HH:mm` (or `--end`, `--project`, `--note`, `--tag`, `--untag`).
