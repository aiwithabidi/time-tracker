# Handoff: v1.2 Web Dashboard — Milestone Setup

**Date:** 2026-02-28
**Context:** v1.2 milestone started, research done, requirements defined. Roadmap creation is next.

## Done This Session

1. **Bug fix**: `tt` crashing with "duplicate column name: paused_at" — fixed `src/db/migrate.ts:127`, rebuilt binary, deployed to `~/.tt/bin/tt`
2. **Milestone started**: PROJECT.md + STATE.md updated for v1.2
3. **Research complete**: 4 parallel researchers wrote Stack, Features, Architecture, Pitfalls to `.planning/research/`
4. **Requirements defined**: 18 reqs in `.planning/REQUIREMENTS.md` (SRV-01..04, TODAY-01..03, WEEK-01..03, PROJ-01..03, TIME-01, ACT-01..02, UI-01..02)

## Next Step

**Create the roadmap.** Spawn `gsd-roadmapper` with:
- Phase numbering starts at **11** (v1.1 ended at 10)
- Files: PROJECT.md, REQUIREMENTS.md, research/SUMMARY.md, MILESTONES.md
- Write: ROADMAP.md, update STATE.md + REQUIREMENTS.md traceability
- Present to user for approval, then commit

Research suggests 5 phases: Server Shell → Today View + API → WebSocket + Live Timer → Weekly + Project Views → Quick Actions + Timeline

## User Notes

- Dashboard is part of `tt` CLI binary (same codebase)
- Must survive Claude Code updates (lives in `~/.tt/`)
- Real-time WebSocket, minimal dark theme, quick actions
- Only new dep: Chart.js ^4.5.1

## Commits

- `8b0472e` fix: handle duplicate column name error in schema migration
- `9258ca1` docs: start milestone v1.2 Web Dashboard
- `477817d` docs: define milestone v1.2 requirements and research
