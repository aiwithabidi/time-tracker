import type { Session, Project, SessionNote, SessionTag } from '../../db/types'

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
  idleState: import('./idle-detector').IdleState | null
  idleDurationMs: number
}

export interface SessionStartOptions {
  projectOverride?: string
}

export interface SessionStopOptions {
  projectOverride?: string
}

export interface PulseOptions {
  readonly cwd: string
  readonly source: string
  readonly terminalId: string
  readonly claudeSessionId?: string
}

export interface PulseResult {
  readonly action: 'created' | 'attached' | 'pulsed' | 'rate-limited'
  readonly session?: Session
  readonly project?: Project
}

export interface AwayResult {
  readonly action: 'paused' | 'already_paused'
  readonly session: Session
  readonly project: Project
  readonly pauseDurationMs?: number
}

export interface BackResult {
  readonly session: Session
  readonly project: Project
  readonly breakDurationMs: number
}

export interface EditOptions {
  readonly start?: string
  readonly end?: string
  readonly project?: string
  readonly note?: string
  readonly tag?: string
  readonly untag?: string
}

export interface EditResult {
  readonly session: Session
  readonly changes: string[]
}

export interface UndoResult {
  readonly operation: string
  readonly restoredSessionIds: string[]
}
