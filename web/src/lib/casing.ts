// Maps between Postgres snake_case rows and camelCase domain objects. Recurses
// objects and arrays; leaves primitives (incl. ISO date strings and uuid values)
// untouched, so it's safe to run on whole rows including jsonb/array columns.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Symmetric inverses: snake->camel only consumes `_<letter>` (not `_<digit>`), and
// camel->snake only inserts `_` before uppercase letters (never digits), so an
// underscore before a digit (e.g. address_2) survives a round-trip.
const snakeKey = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())
const camelKey = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())

export function toCamel<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => toCamel(v)) as T
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[snakeKey(k)] = toCamel(v)
    return out as T
  }
  return value as T
}

export function toSnake<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => toSnake(v)) as T
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[camelKey(k)] = toSnake(v)
    return out as T
  }
  return value as T
}
