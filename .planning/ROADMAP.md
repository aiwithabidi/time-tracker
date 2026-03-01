# Roadmap: TimeTracker

## Milestones

- **v1.0 MVP** -- Phases 1-5 (shipped 2026-02-28) | [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Hardening** -- Phases 6-10 (shipped 2026-02-28) | [Archive](milestones/v1.1-ROADMAP.md)
- **v1.2 Web Dashboard** -- Phases 11-15 (in progress)

## Phases

- [ ] **Phase 11: Server Shell + Dark Theme** - HTTP server with `tt dashboard` command, static HTML/CSS/JS shell, dark theme, tab navigation
- [ ] **Phase 12: Today View** - API endpoints backed by existing services, today's active session, project breakdown chart, status indicator
- [ ] **Phase 13: WebSocket + Live Timer** - Real-time WebSocket push for timer ticks, session state changes, and auto-refresh
- [ ] **Phase 14: Weekly View + Project Deep Dive** - Weekly bar chart with totals/comparison, project detail with session history/notes/tags/earnings
- [ ] **Phase 15: Quick Actions + Timeline** - Start/stop/switch from browser, color-coded session timeline bar

## Phase Details

### Phase 11: Server Shell + Dark Theme
**Goal**: User can launch `tt dashboard` and see a styled, navigable dashboard shell in the browser
**Depends on**: Nothing (first phase of v1.2)
**Requirements**: SRV-01, SRV-02, SRV-04, UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. Running `tt dashboard` starts a local HTTP server and opens the default browser to the dashboard URL
  2. The `--port` flag and `TT_DASHBOARD_PORT` env var control which port the server listens on
  3. The dashboard displays a dark-themed shell with tab navigation (Today, Week, Projects, Timeline)
  4. Running `tt now` or other CLI commands remains under 100ms (dashboard code is lazy-loaded)
  5. The server process reuses the existing service layer in-process (no separate API server)
**Plans**: TBD

### Phase 12: Today View
**Goal**: User can see their current work status and today's time breakdown at a glance
**Depends on**: Phase 11
**Requirements**: TODAY-01, TODAY-02, TODAY-03
**Success Criteria** (what must be TRUE):
  1. The Today tab shows the active session with a ticking timer displaying elapsed time
  2. A project breakdown chart (doughnut) shows time distribution across today's projects
  3. An active/idle/paused status indicator reflects the current session state
**Plans**: TBD

### Phase 13: WebSocket + Live Timer
**Goal**: Dashboard updates in real-time without manual page refresh
**Depends on**: Phase 12
**Requirements**: SRV-03
**Success Criteria** (what must be TRUE):
  1. Timer display ticks every second without page refresh via WebSocket push
  2. Starting or stopping a session from the CLI immediately reflects in the open dashboard
  3. Status changes (active to idle, idle to paused) appear in the dashboard within 2 seconds
**Plans**: TBD

### Phase 14: Weekly View + Project Deep Dive
**Goal**: User can review weekly patterns and drill into per-project detail
**Depends on**: Phase 12
**Requirements**: WEEK-01, WEEK-02, WEEK-03, PROJ-01, PROJ-02, PROJ-03
**Success Criteria** (what must be TRUE):
  1. The Week tab shows a stacked bar chart with hours per project per day for the current week
  2. Weekly totals are displayed with a comparison to the previous week (delta)
  3. An earnings summary shows billable totals per project for the week
  4. Clicking a project opens a detail view with session history, notes, tags, and total earnings
**Plans**: TBD

### Phase 15: Quick Actions + Timeline
**Goal**: User can control time tracking and visualize their day from the dashboard
**Depends on**: Phase 13, Phase 14
**Requirements**: ACT-01, ACT-02, TIME-01
**Success Criteria** (what must be TRUE):
  1. User can start and stop sessions directly from the dashboard UI
  2. User can switch between projects from a project selector in the dashboard
  3. A color-coded horizontal timeline bar shows project switches throughout the day
  4. Quick actions update the dashboard state immediately via WebSocket
**Plans**: TBD

## Progress

| Phase | Milestone | Status | Completed |
|-------|-----------|--------|-----------|
| 1-5 | v1.0 MVP | Complete | 2026-02-28 |
| 6-10 | v1.1 Hardening | Complete | 2026-02-28 |
| 11. Server Shell + Dark Theme | v1.2 Web Dashboard | Not started | - |
| 12. Today View | v1.2 Web Dashboard | Not started | - |
| 13. WebSocket + Live Timer | v1.2 Web Dashboard | Not started | - |
| 14. Weekly View + Project Deep Dive | v1.2 Web Dashboard | Not started | - |
| 15. Quick Actions + Timeline | v1.2 Web Dashboard | Not started | - |
