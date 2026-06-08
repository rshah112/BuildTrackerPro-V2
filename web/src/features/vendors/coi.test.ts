import { describe, it, expect } from 'vitest'
import { coiStatus } from './coi'

const today = new Date(2026, 5, 8) // 2026-06-08 (local)

describe('coiStatus', () => {
  it('classifies none / ok / expiring / expired relative to today', () => {
    expect(coiStatus(null, today)).toBe('none')
    expect(coiStatus('', today)).toBe('none')
    expect(coiStatus('2026-12-31', today)).toBe('ok') // far future
    expect(coiStatus('2026-06-30', today)).toBe('expiring') // 22 days out (<= 30)
    expect(coiStatus('2026-06-08', today)).toBe('expiring') // today counts as expiring
    expect(coiStatus('2026-06-01', today)).toBe('expired') // past
  })
})
