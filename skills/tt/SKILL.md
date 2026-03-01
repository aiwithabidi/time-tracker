---
name: tt
description: Show current time tracking status — active session, project, duration, today's total
disable-model-invocation: true
---

Current time tracking status:

!`NO_COLOR=1 ~/.tt/bin/tt now 2>&1`

Present this status to the user concisely. Include the project name, running duration, and today's total. If no session is active, let the user know and suggest `/tt:start`.
