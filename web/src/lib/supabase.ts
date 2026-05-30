import { createClient } from '@supabase/supabase-js'

// Env comes from .env (local: filled in by `supabase start`; prod: Vercel env vars).
// Defaults point at the local stack so module import never throws when env is absent
// (e.g. in unit tests); no network call happens until a query runs.
const url = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'local-anon-key'

// All tables live in the `buildtracker` schema so this app can share a Supabase
// project with others. `.from()`/`.rpc()` target this schema by default; auth and
// storage are unaffected.
export const supabase = createClient(url, anonKey, {
  db: { schema: 'buildtracker' },
})
