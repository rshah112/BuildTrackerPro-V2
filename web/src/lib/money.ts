// Mirror of ParamusBuild/Data/MoneyMath.swift.
//
// Every money value in the app is a `number` of dollars, treated as exact cents.
// All aggregation routes through integer cents so a run of sums can't drift below
// the cent and flip a budget-health comparison (actual > budget). Native Swift and
// this port both use IEEE-754 doubles, so `value * 100` produces bit-identical
// results on both — the rounding rule below is what keeps them in lockstep.

// Round half to even (banker's rounding), matching Swift's `.toNearestOrEven`.
// JS `Math.round` rounds half away from zero toward +Infinity, so the exact-half
// case is handled explicitly; every other case agrees with `Math.round`.
function roundHalfToEven(n: number): number {
  if (Math.abs(n - Math.trunc(n)) === 0.5) {
    const f = Math.floor(n)
    return f % 2 === 0 ? f : f + 1
  }
  return Math.round(n)
}

export function cents(value: number): number {
  return roundHalfToEven(value * 100)
}

export function dollars(c: number): number {
  return c / 100
}

export function sum(values: Iterable<number>): number {
  let total = 0
  for (const v of values) total += cents(v)
  return dollars(total)
}

export function sumBy<T>(items: Iterable<T>, key: (t: T) => number): number {
  let total = 0
  for (const it of items) total += cents(key(it))
  return dollars(total)
}

export function diff(a: number, b: number): number {
  return dollars(cents(a) - cents(b))
}

export function roundedToCents(v: number): number {
  return dollars(cents(v))
}

const FMT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export const fmt = (v: number) => FMT.format(v)
