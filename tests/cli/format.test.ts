import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDuration } from '../../src/cli/format'

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(100, 'USD')).toBe('$100.00')
  })

  it('formats EUR correctly', () => {
    const result = formatCurrency(1234.5, 'EUR')
    expect(result).toContain('1,234.50')
  })

  it('formats zero correctly', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00')
  })

  it('formats fractional amounts', () => {
    expect(formatCurrency(49.99, 'USD')).toBe('$49.99')
  })
})

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(3_600_000)).toBe('1h')
    expect(formatDuration(5_400_000)).toBe('1h 30m')
  })

  it('shows < 1m for sub-minute durations', () => {
    expect(formatDuration(30_000)).toBe('< 1m')
  })
})
