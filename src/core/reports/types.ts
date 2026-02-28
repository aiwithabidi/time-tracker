import type { Session, Project } from '../../db/types'

export interface ProjectSummary {
  readonly project: Project
  readonly totalMs: number
  readonly sessionCount: number
}

export interface DayGroup {
  readonly date: string
  readonly displayDate: string
  readonly sessions: SessionRow[]
  readonly totalMs: number
}

export interface SessionRow {
  readonly session: Session
  readonly project: Project
  readonly durationMs: number
}

export interface WeekSummary {
  readonly weekStart: string
  readonly weekEnd: string
  readonly projects: ProjectSummary[]
  readonly grandTotalMs: number
}

export interface TodaySummary {
  readonly projects: ProjectSummary[]
  readonly grandTotalMs: number
  readonly activeSession?: { session: Session; project: Project; durationMs: number }
}

export interface LastSessionResult {
  readonly session: Session
  readonly project: Project
  readonly durationMs: number
}
