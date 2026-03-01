---
name: tt:review
description: Generate a formatted work review from time tracking data and git history
argument-hint: "[--from DATE] [--to DATE] [--project SLUG] [--spread N]"
---

## Step 1: Gather data

Run the gather command to collect sessions and git commits:

!`NO_COLOR=1 ~/.tt/bin/tt review gather $ARGUMENTS 2>&1`

## Step 2: Choose audience

If no `--audience` was specified in the arguments, ask the user which audience format they want:
- **client**: Professional summary focused on deliverables and hours. Suitable for invoices/status updates.
- **developer**: Technical summary with commit details, session breakdown, and tags.
- **email**: Brief email-friendly format with key highlights and total hours.

## Step 3: Format the review

Using the gathered data above, create a well-formatted markdown review appropriate for the chosen audience:

**Client format**: Focus on deliverables, group by project, show total hours. Omit internal details like session IDs or idle time.

**Developer format**: Include commit log, session details with notes/tags, time breakdowns. Technical and detailed.

**Email format**: Brief, 3-5 bullet points of key work done, total hours at the bottom. Ready to paste into an email.

If `--spread` was used, present the data as a daily breakdown across the spread days.

## Step 4: User approval

Present the formatted review to the user. Ask if they want to:
1. Save it as-is
2. Edit it (let them provide changes, then re-present)
3. Cancel

## Step 5: Save

Once approved, save the review. Extract the period-start, period-end, and total-ms from the gathered JSON data, then run:

```
~/.tt/bin/tt review save --title "<generated or user-provided title>" --audience <audience> --content "<the approved review content>" --period-start <ms> --period-end <ms> --total-ms <ms>
```

Confirm the saved review ID to the user.
