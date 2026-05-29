import { supabase } from '../lib/supabase'
import { toCamel, toSnake } from '../lib/casing'

// Thin typed wrapper over a Supabase table: camelCase domain objects in/out,
// snake_case columns on the wire. RLS scopes every row to the owner, and `owner`
// defaults to auth.uid() in the schema, so the client never sets it.

export interface TableApi<T> {
  list(filter?: Record<string, unknown>): Promise<T[]>
  get(id: string): Promise<T | null>
  create(input: Partial<T>): Promise<T>
  update(id: string, patch: Partial<T>): Promise<T>
  remove(id: string): Promise<void>
}

export function table<T>(name: string): TableApi<T> {
  return {
    async list(filter) {
      let q = supabase.from(name).select('*')
      if (filter) {
        const snake = toSnake<Record<string, unknown>>(filter)
        for (const [col, val] of Object.entries(snake)) {
          q = val === null ? q.is(col, null) : q.eq(col, val as never)
        }
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row) => toCamel<T>(row))
    },
    async get(id) {
      const { data, error } = await supabase.from(name).select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? toCamel<T>(data) : null
    },
    async create(input) {
      const { data, error } = await supabase.from(name).insert(toSnake(input) as never).select().single()
      if (error) throw error
      return toCamel<T>(data)
    },
    async update(id, patch) {
      const { data, error } = await supabase.from(name).update(toSnake(patch) as never).eq('id', id).select().single()
      if (error) throw error
      return toCamel<T>(data)
    },
    async remove(id) {
      const { error } = await supabase.from(name).delete().eq('id', id)
      if (error) throw error
    },
  }
}
