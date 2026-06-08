export type CoiStatus = 'none' | 'ok' | 'expiring' | 'expired'

/** Certificate-of-insurance status relative to today, from a vendor's insuranceExpiry date:
 *  'expired' (date has passed), 'expiring' (within 30 days), 'ok', or 'none' (not tracked).
 *  `today` is injectable for testing. */
export function coiStatus(insuranceExpiry: string | null | undefined, today: Date = new Date()): CoiStatus {
  const iso = insuranceExpiry?.slice(0, 10)
  if (!iso) return 'none'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return 'none'
  const exp = new Date(y, m - 1, d).getTime()
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const days = Math.round((exp - t) / 86_400_000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'ok'
}
