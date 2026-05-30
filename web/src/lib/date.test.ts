import { describe, expect, it } from 'vitest'
import { fmtDate } from './date'

describe('fmtDate', () => {
  it('formats the stored calendar day without timezone shift', () => {
    // Midnight-UTC timestamptz must render as May 30, not May 29, regardless of zone.
    expect(fmtDate('2026-05-30T00:00:00+00:00')).toBe(new Date(2026, 4, 30).toLocaleDateString())
  })

  it('accepts date-only strings', () => {
    expect(fmtDate('2026-01-02')).toBe(new Date(2026, 0, 2).toLocaleDateString())
  })

  it('passes through Intl options', () => {
    expect(fmtDate('2026-05-30', { weekday: 'short', month: 'short', day: 'numeric' })).toBe(
      new Date(2026, 4, 30).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    )
  })

  it('returns empty string for missing or invalid input', () => {
    expect(fmtDate(null)).toBe('')
    expect(fmtDate(undefined)).toBe('')
    expect(fmtDate('')).toBe('')
    expect(fmtDate('not-a-date')).toBe('')
  })
})
