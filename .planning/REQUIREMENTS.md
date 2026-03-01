# Requirements: v1.2 Web Dashboard

## Server & Infrastructure

- [ ] **SRV-01**: User can run `tt dashboard` to start a local web server and auto-open browser
- [ ] **SRV-02**: Dashboard server reuses existing service layer (same process, same DB connection)
- [ ] **SRV-03**: Real-time updates via WebSocket (timer ticks, session changes push without refresh)
- [ ] **SRV-04**: Server supports `--port` flag and `TT_DASHBOARD_PORT` env var override

## Today View

- [ ] **TODAY-01**: User can see current active session with live ticking timer
- [ ] **TODAY-02**: User can see today's breakdown by project (time per project)
- [ ] **TODAY-03**: User can see active/idle/paused status indicator

## Weekly View

- [ ] **WEEK-01**: User can see hours per project per day as a bar chart
- [ ] **WEEK-02**: User can see weekly totals with comparison to previous week
- [ ] **WEEK-03**: User can see earnings summary per project for the week

## Project Deep Dive

- [ ] **PROJ-01**: User can click a project to see its session history
- [ ] **PROJ-02**: User can see session notes and tags for a project
- [ ] **PROJ-03**: User can see total earnings for a project

## Timeline

- [ ] **TIME-01**: User can see a color-coded horizontal bar of the day showing project switches

## Quick Actions

- [ ] **ACT-01**: User can start/stop sessions from the dashboard
- [ ] **ACT-02**: User can switch between projects from the dashboard

## UI & Theme

- [ ] **UI-01**: Dashboard uses minimal dark theme matching terminal aesthetic
- [ ] **UI-02**: Dashboard lazy-loads so `tt now` and other CLI commands stay under 100ms

## Future Requirements (deferred)

- [ ] Activity pattern analytics (productive hours, focus time)
- [ ] Git context display per session
- [ ] Multi-week / monthly reports
- [ ] Customizable project colors
- [ ] Keyboard shortcuts for navigation

## Out of Scope

- **Cloud/deployed dashboard** — local only, no auth needed
- **Mobile responsive design** — desktop developer tool
- **Team views** — personal tool
- **PDF/print export** — use browser print or CSV export
- **Drag-and-drop time editing** — use CLI `tt edit` commands
- **Calendar integration** — timeline bar is the alternative
- **AI-powered insights** — simple computed metrics only

## Traceability

| REQ ID | Phase | Status |
|--------|-------|--------|
| SRV-01 | — | Pending |
| SRV-02 | — | Pending |
| SRV-03 | — | Pending |
| SRV-04 | — | Pending |
| TODAY-01 | — | Pending |
| TODAY-02 | — | Pending |
| TODAY-03 | — | Pending |
| WEEK-01 | — | Pending |
| WEEK-02 | — | Pending |
| WEEK-03 | — | Pending |
| PROJ-01 | — | Pending |
| PROJ-02 | — | Pending |
| PROJ-03 | — | Pending |
| TIME-01 | — | Pending |
| ACT-01 | — | Pending |
| ACT-02 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
