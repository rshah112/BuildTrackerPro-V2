import { describe, expect, it } from 'vitest'
import { barWidthPct, clampFraction, sparklinePoints } from './chartMath'

describe('clampFraction', () => {
  it('returns the ratio, clamped to [0,1]', () => {
    expect(clampFraction(50, 100)).toBe(0.5)
    expect(clampFraction(150, 100)).toBe(1)
    expect(clampFraction(-10, 100)).toBe(0)
  })
  it('is 0 when max is non-positive (avoids divide-by-zero)', () => {
    expect(clampFraction(10, 0)).toBe(0)
    expect(clampFraction(10, -5)).toBe(0)
  })
})

describe('barWidthPct', () => {
  it('scales the clamped fraction to a percentage', () => {
    expect(barWidthPct(25, 100)).toBe(25)
    expect(barWidthPct(200, 100)).toBe(100)
  })
})

describe('sparklinePoints', () => {
  it('returns no points for an empty series', () => {
    expect(sparklinePoints([], 100, 50)).toEqual([])
  })

  it('centers a single point horizontally', () => {
    const [[x]] = sparklinePoints([5], 100, 50, 0)
    expect(x).toBe(50)
  })

  it('maps endpoints to the horizontal edges and stays within the viewBox', () => {
    const pts = sparklinePoints([0, 5, 10], 100, 50, 0)
    expect(pts).toHaveLength(3)
    expect(pts[0][0]).toBe(0)
    expect(pts[2][0]).toBe(100)
    // min value sits at the bottom, max at the top (y inverted)
    expect(pts[0][1]).toBe(50)
    expect(pts[2][1]).toBe(0)
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(100)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(50)
    }
  })
})
