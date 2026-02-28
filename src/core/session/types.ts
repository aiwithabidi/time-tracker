import type { Session, Project } from '../../db/types'

export interface SessionStartResult {
  action: 'created' | 'attached' | 'already_active'
  session: Session
  project: Project
  source: 'git' | 'alias' | 'dir' | 'prompt'
  staleSessionClosed?: { id: string; duration: number }
}

export interface SessionStopResult {
  session: Session
  project: Project
  durationMs: number
}

export interface SessionNowResult {
  session: Session | null
  project: Project | null
  durationMs: number
  todayTotalMs: number
  todaySessionCount: number
}

export interface SessionStartOptions {
  projectOverride?: string
}

export interface SessionStopOptions {
  projectOverride?: string
}
