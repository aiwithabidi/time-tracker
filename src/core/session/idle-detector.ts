export type IdleState = 'active' | 'soft-idle' | 'hard-idle' | 'paused'

export interface IdleConfig {
  readonly softIdleMs: number
  readonly hardIdleMs: number
}

export const DEFAULT_IDLE_CONFIG: IdleConfig = {
  softIdleMs: 8 * 60 * 1000,
  hardIdleMs: 20 * 60 * 1000,
}

export function computeIdleState(
  lastPulseAt: number,
  nowMs: number,
  pausedAt: number | null,
  config: IdleConfig,
): IdleState {
  if (pausedAt !== null) {
    return 'paused'
  }

  const elapsed = nowMs - lastPulseAt

  if (elapsed >= config.hardIdleMs) {
    return 'hard-idle'
  }

  if (elapsed >= config.softIdleMs) {
    return 'soft-idle'
  }

  return 'active'
}

export function computeIdleDeduction(
  lastPulseAt: number,
  nowMs: number,
  config: IdleConfig,
): number {
  const elapsed = nowMs - lastPulseAt

  if (elapsed < config.hardIdleMs) {
    return 0
  }

  return Math.max(0, elapsed - config.softIdleMs)
}
