// Creates the single local test user via the Supabase admin API (idempotent).
// Run with: node --env-file=.env scripts/seed-user.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE
const email = process.env.E2E_EMAIL || 'raj@local.test'
const password = process.env.E2E_PASSWORD || 'localtest123'

const supa = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const { error } = await supa.auth.admin.createUser({ email, password, email_confirm: true })

if (error && !/already|exists|registered/i.test(error.message)) {
  console.error('seed-user failed:', error.message)
  process.exit(1)
}
console.log('seed user ready:', email)
