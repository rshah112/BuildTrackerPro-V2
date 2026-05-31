import { describe, it, expect } from 'vitest'
import type { Phase } from '../../domain/types'
import { phaseProgress, sortPhases, clampPct } from './phaseMath'

const phase = (over: Partial<Phase>): Phase => ({
  id: Math.random().toString(36).slice(2),
  owner: 'o',
  projectId: 'p',
  name: 'Phase',
  pctComplete: 0,
  sortOrder: 0,
  targetDate: null,
  notes: '',
  createdAt: '2026-01-01',
  ...over,
})

describe('clampPct', () => {
  it('clamps and rounds into 0–100', () => {
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(150)).toBe(100)
    expect(clampPct(33.6)).toBe(34)
    expect(clampPct(Number.NaN)).toBe(0)
  })
})

describe('sortPhases', () => {
  it('orders by sortOrder then createdAt', () => {
    const out = sortPhases([
      phase({ name: 'B', sortOrder: 1 }),
      phase({ name: 'A', sortOrder: 0 }),
      phase({ name: 'A2', sortOrder: 0, createdAt: '2026-02-01' }),
    ])
    expect(out.map((p) => p.name)).toEqual(['A', 'A2', 'B'])
  })
})

describe('phaseProgress', () => {
  it('is empty for no phases', () => {
    expect(phaseProgress([])).toEqual({ overall: 0, done: 0, total: 0, current: null })
  })

  it('averages completion and counts done', () => {
    const r = phaseProgress([
      phase({ name: 'a', pctComplete: 100, sortOrder: 0 }),
      phase({ name: 'b', pctComplete: 50, sortOrder: 1 }),
      phase({ name: 'c', pctComplete: 0, sortOrder: 2 }),
    ])
    expect(r.overall).toBe(50) // (100+50+0)/3
    expect(r.done).toBe(1)
    expect(r.total).toBe(3)
    expect(r.current?.name).toBe('b') // first started-but-unfinished
  })

  it('falls back to the first unfinished phase when none are in progress', () => {
    const r = phaseProgress([
      phase({ name: 'a', pctComplete: 100, sortOrder: 0 }),
      phase({ name: 'b', pctComplete: 0, sortOrder: 1 }),
    ])
    expect(r.current?.name).toBe('b')
  })

  it('clamps out-of-range stored values', () => {
    const r = phaseProgress([phase({ pctComplete: 250 }), phase({ pctComplete: -10 })])
    expect(r.overall).toBe(50) // (100 + 0) / 2
    expect(r.done).toBe(1)
  })
})
