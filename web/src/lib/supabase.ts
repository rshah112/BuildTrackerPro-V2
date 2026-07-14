import { createClient } from '@supabase/supabase-js'

export interface SupabaseConfigInput {
  production: boolean
  url?: string
  anonKey?: string
}

export interface SupabaseConfig {
  url: string
  anonKey: string
}

/** Production builds must receive an explicit project URL and anon key from the
 * deployment environment. Development keeps a local-stack fallback for tests and setup. */
export function resolveSupabaseConfig(input: SupabaseConfigInput): SupabaseConfig {
  const url = input.url?.trim()
  const anonKey = input.anonKey?.trim()

  if (Boolean(url) !== Boolean(anonKey)) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured together.')
  }
  if (url && anonKey) return { url, anonKey }
  if (input.production) {
    throw new Error(
      'Missing production Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.',
    )
  }
  return { url: 'http://127.0.0.1:54321', anonKey: 'local-anon-key' }
}

const config = resolveSupabaseConfig({
  production: import.meta.env.PROD,
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
})

// All tables live in the `buildtracker` schema so this app can share a Supabase
// project with others. `.from()`/`.rpc()` target this schema by default; auth and
// storage are unaffected.
export const supabase = createClient(config.url, config.anonKey, {
  db: { schema: 'buildtracker' },
})
