import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeSessionDuration } from '../duration'

describe('computeSessionDuration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('computes duration for a completed session', () => {
    const session = {
      startTime: 1000,
      endTime: 5000,
      idleDeductedMs: 0,
    }
    expect(computeSessionDuration(session)).toBe(4000)
  })

  it('subtracts idle deducted time', () => {
    const session = {
      startTime: 1000,
      endTime: 5000,
      idleDeductedMs: 1500,
    }
    expect(computeSessionDuration(session)).toBe(2500)
  })

  it('returns 0 when idle exceeds wall time', () => {
    const session = {
      startTime: 1000,
      endTime: 3000,
      idleDeductedMs: 5000,
    }
    expect(computeSessionDuration(session)).toBe(0)
  })

  it('uses Date.now() when endTime is null (active session)', () => {
    const now = 10000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const session = {
      startTime: 2000,
      endTime: null,
      idleDeductedMs: 0,
    }
    expect(computeSessionDuration(session)).toBe(8000)
  })

  it('uses Date.now() when endTime is undefined', () => {
    const now = 10000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const session = {
      startTime: 3000,
      endTime: undefined,
      idleDeductedMs: 1000,
    }
    expect(computeSessionDuration(session)).toBe(6000)
  })

  it('handles zero-length session', () => {
    const session = {
      startTime: 5000,
      endTime: 5000,
      idleDeductedMs: 0,
    }
    expect(computeSessionDuration(session)).toBe(0)
  })

  it('handles large idle deduction on active session', () => {
    const now = 10000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const session = {
      startTime: 5000,
      endTime: null,
      idleDeductedMs: 99999,
    }
    expect(computeSessionDuration(session)).toBe(0)
  })
})
