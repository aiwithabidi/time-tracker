# Feature Landscape: v1.2 Web Dashboard

**Domain:** Local web dashboard for CLI-first time tracker (freelance developer tool)
**Researched:** 2026-02-28
**Confidence:** HIGH (features derived from existing data model + competitive analysis of Toggl, Clockify, WakaTime, Super Productivity)

---

## Table Stakes

Features users expect from any time tracking dashboard. Missing any of these and the dashboard feels incomplete or pointless compared to the CLI.

| Feature | Why Expected | Complexity | CLI Dependency | Notes |
|---------|--------------|------------|----------------|-------|
| Live timer display | Every time tracker (Toggl, Clockify, WakaTime) shows a ticking clock for the active session; this is the first thing users look at when opening a dashboard | Low | `findActiveAll()` + `computeSessionDuration()` | Update every second via WebSocket; show project name, elapsed time, active/idle/paused state |
| Today summary | Toggl, Clockify, WakaTime all default to "today" as landing view; mirrors `tt today` | Low | `report-service.today()` -- already built | Per-project breakdown with hours and session count; highlight currently active project |
| Weekly summary table | Clockify's weekly report is their most-used view; Toggl shows hours per project per day; mirrors `tt week --billable` | Low | `report-service.week()` -- already built | Table with project rows, daily columns, row/column totals; include billable amounts |
| Project list with hours | Every tool shows all projects; mirrors `tt projects` | Low | `report-service.allProjects()` -- already built | Sortable by name or hours; show hourly rate if set; click through to project detail |
| Start/stop controls | Toggl and Clockify have a prominent start/stop button in every view; without this the dashboard is read-only -- a missed opportunity given the browser is always open | Medium | Session service `start()` / `stop()`; needs new API endpoints | Must handle edge cases: already-active session on another project, paused sessions, confirm before stopping |
| Dark theme | Developer dashboards are expected to be dark; WakaTime is dark by default; Super Productivity offers dark mode; terminal users strongly prefer it | Low | None (CSS/design only) | Use dark gray backgrounds (not pure black per design best practices); minimum 4.5:1 contrast ratio for body text; limit palette to 6-8 project colors |
| `tt dashboard` command | User needs a single entry point to launch the dashboard; every local dev tool (Vite, Storybook, Grafana) works this way | Low | HTTP server setup, `open` for browser launch | Start server on available port, open browser, print URL to stderr, keep process running |
| Active/idle indicator | WakaTime and Toggl show whether you are currently active or idle; the CLI has idle detection (soft 8min, hard 20min auto-pause) but dashboard needs to surface it visually | Low | `pausedAt` field on session, pulse timestamps via `pulse-repository` | Green dot = active (pulse within 2min), yellow = soft-idle (no pulse 2-8min), red = paused/hard-idle |

## Differentiators

Features that set this dashboard apart from Toggl/Clockify/WakaTime. Not expected, but valuable for a freelance developer using a CLI-first local tool.

| Feature | Value Proposition | Complexity | CLI Dependency | Notes |
|---------|-------------------|------------|----------------|-------|
| Session timeline (horizontal bar) | Color-coded horizontal bar showing project switches throughout the day -- like a Gantt chart of your workday; Toggl gates their Timeline view behind paid plans; WakaTime shows coding durations but not project-switch patterns | Medium | `findByDateRange()` for today's sessions; each session has `startTime`, `endTime`, `projectId` | Each session renders as a colored segment proportional to duration; gaps between sessions show as gray (idle/break); this is the "at a glance" view that justifies opening the dashboard instead of running `tt today` |
| Earnings tracker | Running billable totals per project for current week and month; Toggl and Clockify gate profitability tracking behind paid tiers ($13-20/mo); our CLI already has `--billable` flag with `rateAtTime` snapshots | Medium | `rateAtTime` on session rows, project `hourlyRate` and `currency`; need new monthly aggregate query | Show "earned this week" and "earned this month" prominently in header or sidebar; break down by project; use snapshot rate from each session (not current rate) for historical accuracy |
| Real-time updates (WebSocket) | Timer ticks, status changes, project switches update without page refresh; local dev tools (Vite HMR, Next.js) set the expectation that local tools update live; polling feels broken by comparison | Medium | WebSocket server alongside HTTP; broadcast on session lifecycle events | Eliminates the need for manual refresh; critical for live timer to not feel laggy; also enables "leave dashboard open on second monitor" workflow |
| Project deep dive | Click a project to see its session history, notes, tags, and total earnings; combines `tt log --project X` with notes/tags in a browseable view; no competing local tool does this well | Medium | `report-service.log()` with project filter, `note-repository`, `tag-repository` | Searchable/filterable session list; show notes inline; tag chips for filtering; earnings subtotal per session and cumulative |
| Week-over-week comparison | "You worked 32h this week vs 38h last week (-16%)"; Toggl shows this in paid reports but for freelancers tracking utilization it is powerful for spotting overwork or underwork | Low | Two calls to week summary (current vs previous); needs minor extension to `report-service.week()` to accept date offset | Simple percentage change display; optionally show sparkline for last 4 weeks; tiny implementation effort for high perceived value |
| Quick project switch | Click a project card to switch active tracking to that project; faster than typing `tt start --project X` in terminal | Medium | Session `stop()` + `start()` via API; needs atomic operation | Must stop current session and start new one; show confirmation modal if switching mid-session; update timeline and timer immediately via WebSocket |
| Session notes viewer | Browse notes attached to sessions; no competing tool surfaces session-level notes well in a visual format | Low | `note-repository.findBySession()` -- already built | Show inline in project deep dive view and as tooltip/popover on timeline segments |
| Keyboard shortcuts | Developer tool should be keyboard-navigable; matches terminal-native user expectations | Low | JavaScript key event handlers only (no backend dependency) | `s` toggle start/stop, `1-9` switch to project by index, `t` today view, `w` week view, `p` projects view, `?` help overlay |

## Anti-Features

Features to explicitly NOT build. These would bloat the dashboard, violate the project's constraints, or duplicate what better tools already do.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| User authentication / login | Local-only tool; adding auth creates friction and violates offline-first constraint; no user data to protect from yourself | Bind server to `127.0.0.1` only; warn if attempting to expose to network |
| Team views / multi-user | Personal tool (stated in PROJECT.md out-of-scope); team features add auth, permissions, sync complexity | Keep all views single-user; no concept of "team members" |
| Invoice generation | Out of scope per PROJECT.md; adding it means PDF rendering (puppeteer), tax handling, client detail management -- each is a product in itself | Link to CSV export from earnings view; let invoicing tools handle formatting |
| Pomodoro timer | Orthogonal to billing (stated in PROJECT.md out-of-scope); adds timer management UI that competes with the real billable timer | Not even as an option; users can run a separate Pomodoro tool alongside |
| Browser activity tracking | Too invasive per PROJECT.md; requires system permissions; Claude Code hooks are the activity source | Dashboard shows data from hooks/pulses only |
| Cloud sync / backup | Breaks offline-first contract per PROJECT.md; introduces conflict resolution, network dependency, privacy concerns | Show DB file path in a settings/about view; user can back up the SQLite file |
| Report PDF export | Over-engineering; adds heavy dependencies (puppeteer/wkhtmltopdf); CSV export to stdout already exists in CLI | Add print-friendly CSS so browser `Cmd+P` produces clean output if needed |
| Calendar integration (Google/Outlook) | Requires OAuth, external API keys, token refresh logic; complicates a local-only tool significantly | Session timeline serves as the visual calendar alternative |
| Mobile-responsive design | Desktop-first developer tool; mobile optimization adds testing burden for minimal value; this runs on localhost | Acceptable if layout does not break on tablet, but do not optimize for phone breakpoints |
| Drag-and-drop time editing | Complex interaction pattern with many edge cases; `tt edit` CLI command already handles corrections robustly | Show CLI command hints in the UI for editing sessions |
| AI-powered insights | WakaTime does this but requires cloud inference; adds complexity and external dependencies for uncertain value | Simple computed metrics (averages, trends, week-over-week) cover 90% of the insight value |
| Customizable widget layout | Toggl's paid feature; massive frontend state management for a personal tool with one user | Opinionated layout with the right views in the right order; no drag-and-drop dashboard builder |
| Historical rate editing | Changing past rates retroactively creates billing confusion and audit issues | Each session already snapshots `rateAtTime`; display these as read-only; rate changes apply to new sessions only |
| Persistent dashboard daemon | Dashboard should start on demand, not run 24/7 consuming resources | `tt dashboard` starts server; Ctrl+C stops it; no background process |
| Notification system (browser) | Overengineered for a local tool; user has terminal open already | Active/idle indicator in the dashboard is sufficient visual feedback |
| Custom chart date range picker | Date picker widgets add frontend complexity; predefined ranges cover real use cases | Offer "today", "this week", "last week", "this month" as buttons/tabs |

## Feature Dependencies

```
HTTP Server + API Layer (MUST BUILD FIRST)
  |
  +-- Today View (report-service.today())
  |     +-- Live Timer (WebSocket + findActiveAll())
  |     +-- Active/Idle Indicator (pausedAt + pulse timestamps)
  |     +-- Session Timeline Bar (findByDateRange for today)
  |
  +-- Weekly View (report-service.week())
  |     +-- Week-over-Week Comparison (previous week query -- extend week())
  |     +-- Earnings Summary (rateAtTime aggregation)
  |
  +-- Project Deep Dive (report-service.log() + notes + tags)
  |     +-- Session Notes Viewer (note-repository)
  |     +-- Tag Filtering (tag-repository)
  |     +-- Project Earnings (rateAtTime per session)
  |
  +-- Quick Actions (session service start/stop)
  |     +-- Start/Stop Button (API endpoint wrapping session service)
  |     +-- Project Switch (stop + start atomic via API)
  |
  +-- WebSocket Layer (real-time updates)
        +-- Timer Tick (broadcast current duration every second)
        +-- Status Change (session start/stop/pause events)
        +-- Project Switch (update all views when tracking changes)
```

### Dependency Notes

- **HTTP server + API layer is the critical path.** Every dashboard feature depends on being able to serve data and accept commands over HTTP. Build this first.
- **WebSocket is foundational for UX, not a "nice to have."** The live timer and real-time status updates are what make the dashboard feel alive vs. a static report page. Build WebSocket support alongside the HTTP server, not as an afterthought.
- **Existing service reuse is the key efficiency.** The `report-service` already computes today, week, log, and allProjects summaries with types like `TodaySummary`, `WeekSummary`, `DayGroup[]`, and `ProjectSummary[]`. The dashboard API should delegate directly to these functions. Do NOT rewrite query logic for the dashboard -- expose the existing services over HTTP.
- **Project colors must be assigned before the timeline.** The session timeline needs a consistent color per project. Either add a `color` column to the projects table or derive colors deterministically from project slug hashes (simpler, no migration needed).
- **Earnings aggregation needs one new query.** Monthly earnings require summing `(rateAtTime * duration)` grouped by project for an arbitrary date range. The existing `findByDateRange()` returns raw sessions; the aggregation can happen in the service layer using `computeSessionDuration()`.

## MVP Recommendation

Build in this order based on dependencies and user impact:

### Phase 1: Foundation + Core Views (highest impact, lowest risk)

Build the infrastructure and the single most valuable screen.

1. **`tt dashboard` command** -- entry point; starts server, opens browser
2. **HTTP server + JSON API** -- wrap existing `report-service` methods as REST endpoints
3. **WebSocket server** -- alongside HTTP; broadcast session events and timer ticks
4. **Today view with live timer** -- the "killer screen"; shows active session ticking in real-time, today's per-project breakdown, active/idle indicator
5. **Dark theme** -- first impression; set the visual tone immediately; dark gray palette with high-contrast text

### Phase 2: Reporting + Visualization

The views that make the dashboard worth keeping open.

6. **Weekly summary with chart** -- second most-used view; project rows x day columns with totals; billable amounts
7. **Session timeline bar** -- the visual differentiator; color-coded horizontal bar of today's work; gaps show breaks
8. **Earnings tracker** -- week and month billable totals; prominent in header; per-project breakdown

### Phase 3: Interactivity + Actions

Transform the dashboard from read-only to actionable.

9. **Start/stop controls** -- make dashboard actionable; prominent button in header
10. **Quick project switch** -- click project to switch tracking; stop current + start new atomically
11. **Keyboard shortcuts** -- developer UX polish; `s` start/stop, `1-9` projects, `t`/`w`/`p` views

### Phase 4: Deep Dive + Polish

Rich exploration of individual project data.

12. **Project deep dive view** -- session history with notes, tags, earnings per project
13. **Session notes viewer** -- inline in project deep dive; tooltip on timeline segments
14. **Week-over-week comparison** -- simple trend display with percentage change

### Defer to Post-v1.2

- **Tag-based filtering** across all views (start with per-project only in deep dive)
- **Multi-week / monthly report views** (let `tt log` and `tt export` handle longer ranges)
- **Activity pattern analytics** (productive hours, focus time) -- backlog item in PROJECT.md
- **Session editing from dashboard** (complex interaction; CLI `tt edit` is sufficient)
- **Custom date range selection** (predefined ranges cover real use cases)

## Data Already Available vs. Needs Building

| Data Need | Status | Source |
|-----------|--------|--------|
| Today's sessions by project | AVAILABLE | `report-service.today()` returns `TodaySummary` |
| Active session with duration | AVAILABLE | `findActiveAll()` + `computeSessionDuration()` |
| Weekly summary by project | AVAILABLE | `report-service.week()` returns `WeekSummary` |
| Session log with day grouping | AVAILABLE | `report-service.log()` returns `DayGroup[]` |
| All projects with weekly totals | AVAILABLE | `report-service.allProjects()` returns `ProjectSummary[]` |
| Session notes | AVAILABLE | `note-repository.findBySession()` |
| Session tags | AVAILABLE | `tag-repository.findBySession()` |
| Hourly rate per session | AVAILABLE | `rateAtTime` field on session row |
| Project hourly rate + currency | AVAILABLE | `hourlyRate` and `currency` fields on project row |
| Idle/pause state | AVAILABLE | `pausedAt` field on session + `activityPulses` table |
| Individual session duration | AVAILABLE | `computeSessionDuration()` handles idle deduction |
| Start/stop session | AVAILABLE | Session service methods; need HTTP wrapper |
| Previous week summary | NEEDS EXTENSION | Extend `report-service.week()` to accept a week offset or date range |
| Monthly earnings aggregate | NEEDS BUILDING | New service method: `findByDateRange()` for month + aggregate `rateAtTime * durationMs` per project |
| Project color assignment | NEEDS BUILDING | Derive deterministically from slug hash (no migration needed) |
| WebSocket event broadcasting | NEEDS BUILDING | New infrastructure; hook into session lifecycle to broadcast events |
| HTTP API endpoints | NEEDS BUILDING | New route handlers wrapping existing service functions |
| Timer tick broadcasting | NEEDS BUILDING | Server-side interval broadcasting current session elapsed time every second |

## Competitive Context

How this dashboard compares to what users have seen elsewhere:

| Feature | Toggl Track | Clockify | WakaTime | This Dashboard |
|---------|-------------|----------|----------|----------------|
| Live timer | Yes (web) | Yes (web) | No (async) | Yes (WebSocket) |
| Today breakdown | Yes | Yes | Yes | Yes |
| Weekly table | Yes | Yes (free) | Yes | Yes |
| Session timeline | Paid only | No | Durations chart | Free (built-in) |
| Earnings/billable | Paid ($13/mo) | Paid ($12/mo) | No | Free (built-in) |
| Project deep dive | Yes | Yes | Yes | Yes |
| Start/stop from web | Yes | Yes | No | Yes |
| Dark theme | Optional | Optional | Default | Default |
| Offline/local only | No (cloud) | No (cloud) | No (cloud) | Yes (localhost) |
| No account needed | No | No | No | Yes |
| Keyboard shortcuts | Limited | Limited | No | Yes |
| Real-time (no refresh) | Yes | Partial | No | Yes (WebSocket) |

**Key advantage:** This dashboard provides Toggl-paid-tier features (timeline, earnings tracking) for free, running locally with no account, no cloud dependency, and no subscription. The tradeoff is it only tracks Claude Code / terminal sessions, not browser or other app activity.

## Sources

- [Toggl Track Features](https://toggl.com/track/features/) -- dashboard layout, project views, billable rates, timeline view (paid) -- HIGH confidence
- [Clockify Weekly Report](https://clockify.me/help/reports/weekly-report) -- weekly breakdown format, grouping by project -- HIGH confidence
- [Clockify Dashboard](https://clockify.me/help/reports/dashboard) -- billable vs non-billable charts, project breakdown -- HIGH confidence
- [WakaTime](https://wakatime.com/) -- developer-focused metrics, coding activity visualization, durations chart -- MEDIUM confidence
- [Super Productivity](https://super-productivity.com/) -- open-source, privacy-first, offline-first developer time tracking -- MEDIUM confidence
- [Dark Theme Design Tips](https://www.cmarix.com/blog/8-time-tested-dark-theme-design-tips-to-advance-dashboard-development/) -- contrast ratios, avoid pure black, color bin limits (6-12 max) -- MEDIUM confidence
- [Toggl Track Review 2026](https://thedigitalprojectmanager.com/tools/toggl-track-review/) -- feature overview, pricing tiers -- MEDIUM confidence
- [Clockify Freelance Time Tracking](https://clockify.me/freelance-time-tracking) -- freelancer-specific dashboard features -- HIGH confidence

---

*Feature research for: v1.2 Web Dashboard milestone*
*Researched: 2026-02-28*
