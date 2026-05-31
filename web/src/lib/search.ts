/** Case-insensitive substring match across any number of fields. Empty query matches all.
 *  Used by the list screens' search boxes. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((f) => (f ?? '').toLowerCase().includes(q))
}
