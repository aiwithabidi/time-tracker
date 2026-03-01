import { describe, expect, it } from 'vitest'
import { formatGoalDuration, parseDuration } from '../../src/cli/duration-parsing'

describe('parseDuration', () => {
  it('parses hours only', () => {
    expect(parseDuration('6h')).toBe(360)
    expect(parseDuration('1h')).toBe(60)
  })

  it('parses minutes only', () => {
    expect(parseDuration('90m')).toBe(90)
    expect(parseDuration('45m')).toBe(45)
    expect(parseDuration('0m')).toBe(0)
  })

  it('parses hours and minutes without space', () => {
    expect(parseDuration('4h30m')).toBe(270)
  })

  it('parses hours and minutes with space', () => {
    expect(parseDuration('2h 15m')).toBe(135)
  })

  it('handles leading/trailing whitespace', () => {
    expect(parseDuration('  6h  ')).toBe(360)
    expect(parseDuration(' 2h 15m ')).toBe(135)
  })

  it('handles uppercase input', () => {
    expect(parseDuration('6H')).toBe(360)
    expect(parseDuration('4H30M')).toBe(270)
  })

  it('throws on invalid input', () => {
    expect(() => parseDuration('abc')).toThrow()
    expect(() => parseDuration('')).toThrow()
    expect(() => parseDuration('h')).toThrow()
    expect(() => parseDuration('m')).toThrow()
    expect(() => parseDuration('-1h')).toThrow()
    expect(() => parseDuration('6h -30m')).toThrow()
  })

  it('throws on null/undefined', () => {
    expect(() => parseDuration(null as unknown as string)).toThrow()
    expect(() => parseDuration(undefined as unknown as string)).toThrow()
  })
})

describe('formatGoalDuration', () => {
  it('formats hours only', () => {
    expect(formatGoalDuration(360)).toBe('6h')
    expect(formatGoalDuration(60)).toBe('1h')
  })

  it('formats minutes only', () => {
    expect(formatGoalDuration(45)).toBe('45m')
    expect(formatGoalDuration(0)).toBe('0m')
  })

  it('formats hours and minutes', () => {
    expect(formatGoalDuration(90)).toBe('1h 30m')
  })
})
