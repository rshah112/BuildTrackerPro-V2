import { describe, it, expect } from 'vitest'
import { cents, dollars, sum, sumBy, diff, roundedToCents } from './money'

// Golden values verified against IEEE-754 f64 semantics. Native Swift's MoneyMath
// uses the same doubles, so these results are bit-identical across both apps.
describe("money: banker's rounding", () => {
  it('rounds exact halves to even', () => {
    expect(cents(0.005)).toBe(0) // 0.5 -> 0 (even)
    expect(cents(0.015)).toBe(2) // 1.5 -> 2 (even)
    expect(cents(0.025)).toBe(2) // 2.5 -> 2 (even)
    expect(cents(0.035)).toBe(4) // 3.5 -> 4 (even)
    expect(cents(2.5 / 100)).toBe(2)
    expect(cents(3.5 / 100)).toBe(4)
  })

  it('rounds negative exact halves to even', () => {
    expect(cents(-0.025)).toBe(-2) // -2.5 -> -2 (even)
  })

  it('matches native on the classic float-trap inputs', () => {
    // 1.005 * 100 = 100.4999999999999... -> 100 (not 101). Same in Swift.
    expect(cents(1.005)).toBe(100)
    // 2.675 * 100 = 267.5000000000001... -> 268. Same in Swift.
    expect(cents(2.675)).toBe(268)
  })

  it('dollars is the inverse of cents', () => {
    expect(dollars(660)).toBe(6.6)
    expect(dollars(cents(42.37))).toBe(42.37)
  })

  it('sum is cent-exact (no float drift)', () => {
    expect(sum([1.1, 2.2, 3.3])).toBe(6.6) // naive reduce gives 6.6000000000000005
    expect(sum([])).toBe(0)
  })

  it('sumBy projects then sums cent-exact', () => {
    const rows = [{ amt: 1.1 }, { amt: 2.2 }, { amt: 3.3 }]
    expect(sumBy(rows, (r) => r.amt)).toBe(6.6)
  })

  it('diff is cent-exact', () => {
    expect(diff(0.3, 0.1)).toBe(0.2) // naive 0.3 - 0.1 = 0.19999999999999998
    expect(diff(1000, 1200)).toBe(-200)
  })

  it('roundedToCents snaps aggregate drift back to a clean cent', () => {
    expect(roundedToCents(6.6000000000000005)).toBe(6.6)
  })
})
