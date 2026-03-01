---
name: tt:note
description: Add a note to the current time tracking session
argument-hint: "<note text>"
disable-model-invocation: true
---

Adding note to the current session:

!`NO_COLOR=1 ~/.tt/bin/tt note "$ARGUMENTS" 2>&1`

Confirm the note was added, or show any error if the command failed (e.g., no active session).
