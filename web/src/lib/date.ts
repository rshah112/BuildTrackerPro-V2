// Date-only formatting that does NOT shift across timezones.
//
// Stored dates are timestamptz, serialized like "2026-05-30T00:00:00+00:00". Passing
// that straight to `new Date(iso).toLocaleDateString()` converts the instant to the
// local zone first, so midnight-UTC values render as the PREVIOUS day for users behind
// UTC. We instead take the calendar date portion as stored and build a local Date from
// its parts, so the displayed day always matches the stored calendar day.

/** Format the date portion of an ISO string (date-only or full timestamp) in the
 *  device-local calendar, with no UTC day-shift. Returns '' for empty/invalid input. */
export function fmtDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts)
}
