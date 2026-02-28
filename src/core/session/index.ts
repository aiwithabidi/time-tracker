export { createSessionService, type SessionService } from './session-service'
export { NoActiveSessionError, NoProjectFoundError, InvalidTagError } from './errors'
export type {
  SessionStartResult,
  SessionStopResult,
  SessionNowResult,
  SessionStartOptions,
  SessionStopOptions,
  PulseOptions,
  PulseResult,
  AwayResult,
  BackResult,
} from './types'
export { computeIdleState, computeIdleDeduction, DEFAULT_IDLE_CONFIG } from './idle-detector'
export type { IdleState, IdleConfig } from './idle-detector'
