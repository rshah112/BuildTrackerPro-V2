import { createClient } from '@supabase/supabase-js'

// Env comes from .env (local: filled in by `supabase start`). Production falls back to
// the shared Smart_Home_Hub project — its URL and anon key are public by design (the
// anon key is a client JWT that Vite inlines into the browser bundle regardless, and
// every row is guarded by RLS), so baking them in needs no Vercel env config. Dev keeps
// the local stack as its fallback. No network call happens until a query runs.
const PROD_SUPABASE_URL = 'https://wzbtxwnvplpnwmavfdwx.supabase.co'
const PROD_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6YnR4d252cGxwbndtYXZmZHd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Njk2MzEsImV4cCI6MjA5NTE0NTYzMX0.P1BlgrtVK3CpRLjcZsZugB-78_HO4GFSUXplCtbbBAY'

const fallbackUrl = import.meta.env.PROD ? PROD_SUPABASE_URL : 'http://127.0.0.1:54321'
const fallbackAnonKey = import.meta.env.PROD ? PROD_SUPABASE_ANON_KEY : 'local-anon-key'
const url = import.meta.env.VITE_SUPABASE_URL || fallbackUrl
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackAnonKey

// All tables live in the `buildtracker` schema so this app can share a Supabase
// project with others. `.from()`/`.rpc()` target this schema by default; auth and
// storage are unaffected.
export const supabase = createClient(url, anonKey, {
  db: { schema: 'buildtracker' },
})
