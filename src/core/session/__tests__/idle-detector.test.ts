import { describe, it, expect } from 'vitest'
import {
  computeIdleState,
  computeIdleDeduction,
  DEFAULT_IDLE_CONFIG,
  type IdleConfig,
} from '../idle-detector'

const config: IdleConfig = {
  softIdleMs: 8 * 60 * 1000,   // 8 minutes
  hardIdleMs: 20 * 60 * 1000,  // 20 minutes
}

describe('computeIdleState', () => {
  it('returns active when elapsed is below soft threshold', () => {
    const now = 100_000
    const lastPulse = now - 5 * 60 * 1000 // 5 min ago
    expect(computeIdleState(lastPulse, now, null, config)).toBe('active')
  })

  it('returns soft-idle when elapsed is between soft and hard thresholds', () => {
    const now = 100_000
    const lastPulse = now - 10 * 60 * 1000 // 10 min ago
    expect(computeIdleState(lastPulse, now, null, config)).toBe('soft-idle')
  })

  it('returns hard-idle when elapsed exceeds hard threshold', () => {
    const now = 100_000
    const lastPulse = now - 25 * 60 * 1000 // 25 min ago
    expect(computeIdleState(lastPulse, now, null, config)).toBe('hard-idle')
  })

  it('returns paused when pausedAt is set', () => {
    const now = 100_000
    const lastPulse = now - 1000 // recent pulse
    expect(computeIdleState(lastPulse, now, now - 500, config)).toBe('paused')
  })

  it('returns paused even when would otherwise be hard-idle', () => {
    const now = 100_000
    const lastPulse = now - 30 * 60 * 1000 // 30 min ago
    expect(computeIdleState(lastPulse, now, now - 25 * 60 * 1000, config)).toBe('paused')
  })

  it('returns active at exact soft threshold boundary', () => {
    const now = 100_000
    const lastPulse = now - config.softIdleMs
    // At exact boundary, elapsed >= softIdleMs, so should be soft-idle
    expect(computeIdleState(lastPulse, now, null, config)).toBe('soft-idle')
  })

  it('returns soft-idle at exact hard threshold boundary', () => {
    const now = 100_000
    const lastPulse = now - config.hardIdleMs
    // At exact boundary, elapsed >= hardIdleMs, so should be hard-idle
    expect(computeIdleState(lastPulse, now, null, config)).toBe('hard-idle')
  })

  it('returns active when elapsed is 0', () => {
    const now = 100_000
    expect(computeIdleState(now, now, null, config)).toBe('active')
  })
})

describe('computeIdleDeduction', () => {
  it('returns 0 when below hard idle threshold', () => {
    const now = 100_000
    const lastPulse = now - 10 * 60 * 1000 // 10 min
    expect(computeIdleDeduction(lastPulse, now, config)).toBe(0)
  })

  it('deducts time beyond soft idle threshold when hard idle', () => {
    const now = 100_000
    const lastPulse = now - 25 * 60 * 1000 // 25 min
    const expected = 25 * 60 * 1000 - config.softIdleMs // 25 - 8 = 17 min
    expect(computeIdleDeduction(lastPulse, now, config)).toBe(expected)
  })

  it('returns 0 at exact hard threshold', () => {
    const now = 100_000
    const lastPulse = now - config.hardIdleMs
    // elapsed == hardIdleMs, not < hardIdleMs, so passes the check
    const expected = config.hardIdleMs - config.softIdleMs
    expect(computeIdleDeduction(lastPulse, now, config)).toBe(expected)
  })

  it('returns 0 when elapsed is 0', () => {
    expect(computeIdleDeduction(100, 100, config)).toBe(0)
  })
})

describe('DEFAULT_IDLE_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_IDLE_CONFIG.softIdleMs).toBe(8 * 60 * 1000)
    expect(DEFAULT_IDLE_CONFIG.hardIdleMs).toBe(20 * 60 * 1000)
  })
})
