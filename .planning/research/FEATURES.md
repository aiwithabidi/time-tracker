# Feature Research

**Domain:** CLI-first time tracking tool for freelance developers
**Researched:** 2026-02-27
**Confidence:** HIGH (table stakes from multiple verified sources; differentiators from project-specific analysis)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Start/stop timer | Core loop of every time tracker; without this nothing works | LOW | `start`, `stop`, `status` commands |
| Manual time entry with natural language times | Users always forget to start timers; "5 minutes ago", "yesterday at 3pm" are non-negotiable | LOW | Timetrap, track-time-cli, Timewarrior all support this; powered by time-parsing library |
| Edit past entries | Mistakes happen constantly; immutable entries are unusable | MEDIUM | Edit start/end time, note, project; requires entry ID lookup |
| Project/client grouping | Freelancers bill per client; flat list of entries is useless | LOW | Named projects with sessions attached; Watson uses project+tags, timetrap uses sheets |
| Session notes | Context for billing disputes and memory; "what did I do on Tuesday?" | LOW | Free-form text attached to sessions at start or edit time |
| Tags | Cross-project categorization (e.g. "design", "bugfix", "admin") | LOW | Optional; Timewarrior uses tags as primary org primitive |
| Report: today's time | Most common daily review — "how long have I worked today?" | LOW | Running total + breakdown by project |
| Report: time per project with date range | Primary billing artifact; weekly/monthly per-client hours | MEDIUM | Watson `report`, Timewarrior `summary` both offer this |
| CSV/JSON export | Portability to invoicing tools, spreadsheets, ClickUp | LOW | 6 formats in timetrap; all serious tools offer this |
| Current session status | Users need to know what's running right now | LOW | `now` or `status` command showing active timer |
| Stop running session | Explicit stop without needing to know session ID | LOW | Trivially expected; omitting this is a crash |
| Local data storage | Privacy; offline-first; no cloud dependency | LOW | SQLite or flat files are both standard patterns |
| Undo last action | Time tracker state is easy to accidentally corrupt | MEDIUM | Watson has no undo; this is a pain point users cite |
| List/history view | Browse past sessions; confirm what was logged | LOW | Timetrap `display`, Watson `log`, Timewarrior `summary` |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-detect sessions via Claude Code hooks | Zero manual effort for Claude Code users — the primary workflow is fully automatic; no other CLI tracker does this | HIGH | Uses SessionStart/Stop/PreToolUse hooks; requires <100ms execution; unique to this tool |
| Singleton session per project with multi-terminal attach | Prevents the most common double-counting bug when using multiple terminals per project | HIGH | Requires TT_TERMINAL_ID env var; all terminals attach to the same session; no other open-source CLI tracker has this |
| Idle detection with configurable thresholds | Passive sessions stay accurate; common problem: leaving terminal open overnight inflates hours | MEDIUM | Soft idle ~8min warn, hard auto-pause ~20min; timetrackcli does macOS activity sampling; needs macOS idle API or last-activity heuristic |
| Git context capture (branch + commit SHA at session boundaries) | Enables "what did I work on this session?" without retrofitting; invaluable for billing disputes | MEDIUM | GTM does git-native tracking; this tool captures git state as metadata, not as the primary tracking mechanism |
| Hourly rate per project with billable totals | Direct billing insight without leaving the CLI; most CLI trackers export data and defer math to spreadsheets | MEDIUM | Rate snapshot per session (rate at time of work, not current rate); critical for multi-client freelancers |
| Session split and merge commands | Real-world sessions get fragmented; no other CLI tracker makes this ergonomic | MEDIUM | `split` divides a running/past session at a point in time; `merge` combines adjacent sessions of same project |
| Activity pattern analytics (productive hours, focus time) | "When am I actually productive?" — differentiates from raw time logging | HIGH | Requires session history depth; show best hours, average session length, idle ratios; timetrackcli has a 30-day calendar view as proof of concept |
| Rich TUI dashboard with live timer | Single `tt` invocation shows all active state; far more usable than reading log output | MEDIUM | `hours` (Go) uses bubbletea for TUI; timetrackcli uses charmbracelet; this tool uses blessed/ink for Node/Bun TUI |
| Retroactive session correction with `undo` stack | Time tracking errors compound; being able to undo the last N operations reduces fear of using the tool | MEDIUM | Most tools lack this; timetrap has no undo; Watson has no undo |
| Project config file with aliases and rates | `~/projects/acme-corp` → client "ACME Corp" at $150/hr without per-session setup | LOW | Config-driven project inference from directory; Watson has no config-based project mapping |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Pomodoro timer | Seen as complementary to time tracking; popular in productivity circles | Orthogonal to the core value (accurate passive billing); adds UI complexity and timer management that competes with the real timer | Use a dedicated Pomodoro app; time tracker handles billing, not focus technique |
| Invoice generation | Freelancers need invoices; seems like natural next step from billable hours | Invoice formatting, client details, tax handling, PDF generation — each is a product in itself; scope creep that delays shipping core value | Export CSV/JSON; import into a dedicated invoicing tool or spreadsheet template |
| Browser/app activity tracking | "Track everything I do, not just terminal sessions" | Invasive, requires system permissions, creates massive data volume, complex categorization rules — becomes an entirely different product (RescueTime/ActivityWatch territory) | Explicitly out of scope; Claude Code hooks provide sufficient signal for the target user |
| Team/collaborative features | "What if I hire contractors?" | Multiplies auth, permissions, sync, and billing complexity; destroys the "personal tool" simplicity | Out of scope; this is a personal tool; team use case requires a different product |
| Cloud sync / remote backup | "I want my data on multiple machines" | Introduces auth, conflict resolution, network dependency, and privacy concerns; breaks the "local first, offline works" contract | Export JSON for manual backup; local SQLite is trivially copyable |
| Direct ClickUp / third-party API push | "Automate the whole workflow from time tracking to billing" | API rate limits, auth token management, schema drift, and error handling create a maintenance burden; also makes the tool a hard dependency on external services | Export CSV/JSON; v1 manual import is sufficient; direct integration is a v2+ milestone |
| Real-time activity monitoring (keystroke/mouse) | Automatic idle detection seems to require it | System-level permissions on macOS, privacy concerns, background process overhead; the tool's idle detection is session-level, not keystroke-level | Use last-event timestamp heuristic + Claude Code hook activity as the idle signal; no system monitoring daemon needed |
| Mobile app | "Check my hours from my phone" | Entirely different platform, different tech stack, sync complexity; distracts from CLI-first mission | Export and view on phone via ClickUp or spreadsheet import; CLI is the primary surface |

## Feature Dependencies

```
[Claude Code Hook Integration]
    └──requires──> [Session Storage (local DB)]
                       └──requires──> [Project Inference (directory → client)]

[Idle Detection]
    └──requires──> [Session Storage]
    └──enhances──> [Auto-pause on inactivity]

[Multi-terminal Singleton]
    └──requires──> [Session Storage]
    └──requires──> [TT_TERMINAL_ID env var per terminal]

[Billable Totals]
    └──requires──> [Project Config with hourly rates]
    └──requires──> [Session Storage]

[Activity Pattern Analytics]
    └──requires──> [Session history (minimum 2+ weeks of data)]
    └──requires──> [Idle Detection] (to calculate actual focus time vs logged time)

[Git Context Capture]
    └──requires──> [Claude Code Hook Integration] (hooks fire at session boundaries)
    └──enhances──> [Session notes] (auto-populated with branch/SHA)

[Session Split / Merge]
    └──requires──> [Session Storage]
    └──requires──> [Edit past entries]

[Undo Stack]
    └──requires──> [Session Storage]
    └──conflicts──> [hard deletes] (undo requires soft-delete / event log)

[CSV/JSON Export]
    └──requires──> [Session Storage]
    └──requires──> [Project grouping]

[TUI Dashboard]
    └──enhances──> [Current session status]
    └──enhances──> [Report: time per project]
    └──requires──> [Session Storage]
```

### Dependency Notes

- **Claude Code Hook Integration requires Session Storage:** The daemon or DB must exist before hooks can write events; hook scripts must boot in <100ms, so they cannot initialize storage from scratch each time.
- **Activity Pattern Analytics requires 2+ weeks of data:** This feature has no value at day 1; it should be surfaced only after sufficient history exists to avoid empty/misleading charts.
- **Undo Stack conflicts with hard deletes:** If you hard-delete sessions, undo becomes impossible. The soft-delete design decision in PROJECT.md is a prerequisite for undo.
- **Multi-terminal Singleton requires TT_TERMINAL_ID:** This env var must be set per terminal (in Ghostty profile or shell RC) before the feature works; needs onboarding doc or auto-setup command.
- **Git Context Capture requires Hook Integration:** Git context is captured at session boundaries (start/stop), which are triggered by Claude Code lifecycle hooks. Without hooks, git context must be manually invoked.

## MVP Definition

### Launch With (v1)

Minimum viable product — validates that hook-based auto-detection works and produces billable hours output.

- [ ] Claude Code hook integration (SessionStart, Stop → create/close sessions) — core differentiator; proves the concept
- [ ] Session storage (SQLite via Bun) — everything else requires this
- [ ] Project inference from working directory with config override — without this, all sessions are unlabeled
- [ ] `status` / `now` command — basic feedback that the system is running
- [ ] `start`, `stop` manual commands — fallback for non-Claude sessions
- [ ] `week` and `projects` report commands — primary billing artifact
- [ ] Edit past entry (time, note, project) — corrections are mandatory for real use
- [ ] CSV export — data portability to ClickUp; required for billing workflow
- [ ] Idle detection with auto-pause — prevents silent hour inflation overnight
- [ ] Multi-terminal singleton (TT_TERMINAL_ID) — prevents double-counting with multiple Ghostty tabs

### Add After Validation (v1.x)

Features to add once core tracking is working and trusted.

- [ ] Hourly rate per project + billable totals report — add when user has 2+ weeks of accurate data to bill from
- [ ] Undo last operation — add when the user reports accidental overwrites; reduces friction
- [ ] Session split/merge commands — add when session fragmentation becomes a real pain point
- [ ] Git context capture (branch/SHA at boundaries) — add when "what did I work on" question comes up in billing
- [ ] Session tags and freeform notes — add when project-level grouping is insufficient for reporting
- [ ] TUI live dashboard — add when CLI output feels unwieldy for daily review
- [ ] JSON export — add when ClickUp import needs richer data than CSV

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Activity pattern analytics (productive hours, focus time analysis) — requires weeks of data; complex to surface usefully
- [ ] Web dashboard — explicitly out of scope in v1; add when CLI analytics hit limits
- [ ] Per-session rate snapshots with historical rate changes — add when rates change across clients/time periods
- [ ] Natural language time parsing for retroactive entry (`start --at "yesterday 2pm"`) — add when manual correction workflow is established

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Claude Code hook integration | HIGH | HIGH | P1 |
| Session storage (SQLite) | HIGH | LOW | P1 |
| Project inference from directory | HIGH | LOW | P1 |
| `start` / `stop` / `status` commands | HIGH | LOW | P1 |
| Idle detection + auto-pause | HIGH | MEDIUM | P1 |
| Multi-terminal singleton | HIGH | MEDIUM | P1 |
| Weekly/project reports | HIGH | LOW | P1 |
| Edit past entry | HIGH | MEDIUM | P1 |
| CSV export | HIGH | LOW | P1 |
| Undo last operation | MEDIUM | MEDIUM | P2 |
| Session split/merge | MEDIUM | MEDIUM | P2 |
| Hourly rate + billable totals | HIGH | LOW | P2 |
| Git context capture | MEDIUM | LOW | P2 |
| Session notes and tags | MEDIUM | LOW | P2 |
| TUI live dashboard | MEDIUM | HIGH | P2 |
| Activity pattern analytics | MEDIUM | HIGH | P3 |
| JSON export | LOW | LOW | P2 |
| Natural language time parsing | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Watson | Timewarrior | Timetrap | hours (Go) | This Tool |
|---------|--------|-------------|----------|------------|-----------|
| Start/stop timer | Yes | Yes | Yes (in/out) | Yes | Yes |
| Project grouping | Yes (project+tags) | Yes (tags) | Yes (sheets) | Yes (tasks) | Yes (project+client config) |
| Edit past entries | Yes (watson edit) | Yes (timew modify) | Yes (t edit --id) | Yes (TUI) | Yes |
| Natural language times | No | Yes (timew start 10:00) | Yes (Chronic gem) | No | Yes |
| CSV/JSON export | Yes (json) | Yes (via extensions) | Yes (6 formats) | Yes | Yes |
| Idle detection | No | No | No | No | Yes (macOS heuristic) |
| Multi-terminal dedup | No | No | No | No | Yes (singleton per project) |
| Auto-detect from hooks | No | No | No | No | Yes (Claude Code hooks) |
| Undo operation | No | No | No | No | Yes (v1.x) |
| Session split/merge | No | Partial (fill/lengthen) | No | No | Yes (v1.x) |
| Git context capture | No | No | No | No | Yes (v1.x) |
| Billable rate per project | No | No | No | No | Yes (v1.x) |
| TUI dashboard | No | No | No | Yes | Yes (v2) |
| Activity patterns | No | No | No | Partial | Yes (v2+) |
| Local storage only | Yes | Yes | Yes | Yes | Yes |
| Shell completions | Yes | Yes | Yes | No | Yes |

## Sources

- Watson documentation: https://jazzband.github.io/Watson/ (HIGH confidence — official docs)
- Timewarrior documentation: https://timewarrior.net/docs/what/ (HIGH confidence — official docs)
- Timetrap README: https://github.com/samg/timetrap/blob/master/README.md (HIGH confidence — official source)
- hours CLI: https://github.com/dhth/hours (HIGH confidence — official source)
- timetrackcli (idle detection patterns): https://github.com/rezmoss/timetrackcli (MEDIUM confidence — reference implementation)
- GTM (git time metric): https://github.com/git-time-metric/gtm (HIGH confidence — official source)
- track-time-cli (retroactive entry UX): https://dev.to/f3rno64/a-powerful-nodejs-cli-time-tracker-1fb0 (MEDIUM confidence — DEV Community article)
- Slant CLI tracker comparison 2025: https://www.slant.co/versus/19128/41473/~watson_vs_timewarrior (MEDIUM confidence — community voting)
- Redpill-Linpro time tracking evaluation (2025): https://www.redpill-linpro.com/techblog/2025/05/22/time-tracking-software.html (MEDIUM confidence — practitioner analysis)
- LinuxLinks 27 CLI time trackers: https://www.linuxlinks.com/timetrackers/ (MEDIUM confidence — curated list)

---
*Feature research for: CLI-first time tracking tool for freelance developers*
*Researched: 2026-02-27*
