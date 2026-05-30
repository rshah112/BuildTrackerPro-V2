// Pure geometry for the hand-rolled SVG charts. Kept separate so it's unit-testable.

/** value/max clamped to [0, 1]. Returns 0 when max <= 0. */
export function clampFraction(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, value / max))
}

/** Bar fill width as a percentage [0, 100]. */
export function barWidthPct(value: number, max: number): number {
  return clampFraction(value, max) * 100
}

/** Map a series of values to [x, y] points inside a width×height viewBox (padded),
 *  with y inverted (SVG origin top-left). A single point is centered horizontally. */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 2,
): [number, number][] {
  if (values.length === 0) return []
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const n = values.length
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  return values.map((v, i) => {
    const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const y = pad + innerH - ((v - min) / range) * innerH
    return [x, y]
  })
}
