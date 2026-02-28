import { describe, it, expect } from 'vitest'
import { escapeCSVField, toCSVRow, CSV_HEADERS } from '../../../src/core/export/csv'

describe('escapeCSVField', () => {
  it('passes through plain strings unchanged', () => {
    expect(escapeCSVField('hello')).toBe('hello')
    expect(escapeCSVField('simple text')).toBe('simple text')
    expect(escapeCSVField('')).toBe('')
  })

  it('wraps strings with commas in quotes', () => {
    expect(escapeCSVField('hello, world')).toBe('"hello, world"')
  })

  it('doubles internal quotes and wraps', () => {
    expect(escapeCSVField('say "hello"')).toBe('"say ""hello"""')
  })

  it('handles newlines', () => {
    expect(escapeCSVField('line1\nline2')).toBe('"line1\nline2"')
  })

  it('handles field with both commas and quotes', () => {
    expect(escapeCSVField('a "b", c')).toBe('"a ""b"", c"')
  })
})

describe('toCSVRow', () => {
  it('joins fields with commas after escaping', () => {
    expect(toCSVRow(['a', 'b', 'c'])).toBe('a,b,c')
  })

  it('escapes fields that need it', () => {
    expect(toCSVRow(['plain', 'has, comma', 'also "quotes"']))
      .toBe('plain,"has, comma","also ""quotes"""')
  })
})

describe('CSV_HEADERS', () => {
  it('has 8 columns', () => {
    expect(CSV_HEADERS).toHaveLength(8)
  })

  it('includes expected columns', () => {
    expect(CSV_HEADERS).toContain('project')
    expect(CSV_HEADERS).toContain('duration_hours')
    expect(CSV_HEADERS).toContain('notes')
    expect(CSV_HEADERS).toContain('tags')
  })
})
