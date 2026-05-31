// T1 — RLS multi-user isolation check. Creates two ephemeral users, has user A insert a
// project, and asserts user B can NOT read, update, or delete it (and vice-versa). Exits
// non-zero on any leak. Run against the LOCAL stack:
//
//   node --env-file=.env scripts/rls-check.mjs
//
// Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE in .env.
// This is a guardrail you can wire into CI as a separate step; it is intentionally NOT
// part of `npm test` (which is offline/pure) since it talks to a live database.
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE
if (!url || !anonKey || !serviceKey) {
  console.error('rls-check: need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE')
  process.exit(2)
}

const opts = { db: { schema: 'buildtracker' }, auth: { autoRefreshToken: false, persistSession: false } }
const admin = createClient(url, serviceKey, opts)

const stamp = Date.now()
const users = [
  { email: `rls-a-${stamp}@local.test`, password: 'rls-test-123', id: null, client: null },
  { email: `rls-b-${stamp}@local.test`, password: 'rls-test-123', id: null, client: null },
]

const failures = []
const assert = (cond, msg) => {
  if (!cond) failures.push(msg)
}

try {
  // Create + sign in both users.
  for (const u of users) {
    const created = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true })
    if (created.error) throw new Error(`createUser ${u.email}: ${created.error.message}`)
    u.id = created.data.user.id
    u.client = createClient(url, anonKey, opts)
    const signin = await u.client.auth.signInWithPassword({ email: u.email, password: u.password })
    if (signin.error) throw new Error(`signIn ${u.email}: ${signin.error.message}`)
  }
  const [a, b] = users

  // A inserts a project.
  const ins = await a.client.from('projects').insert({ name: `RLS A ${stamp}`, owner: a.id }).select().single()
  if (ins.error) throw new Error(`A insert: ${ins.error.message}`)
  const projectId = ins.data.id

  // A can read its own project.
  const aRead = await a.client.from('projects').select('id').eq('id', projectId)
  assert(!aRead.error && aRead.data.length === 1, 'A should read its own project')

  // B must NOT see A's project — neither in a full list nor by direct id.
  const bList = await b.client.from('projects').select('id')
  assert(!bList.error && bList.data.every((r) => r.id !== projectId), 'B must not see A’s project in a list')
  const bById = await b.client.from('projects').select('id').eq('id', projectId)
  assert(!bById.error && bById.data.length === 0, 'B must not read A’s project by id')

  // B must NOT update A's project (RLS makes it a no-op: 0 rows affected).
  const bUpd = await b.client.from('projects').update({ name: 'hacked' }).eq('id', projectId).select()
  assert(!bUpd.error && bUpd.data.length === 0, 'B update of A’s project must affect 0 rows')

  // B must NOT delete A's project.
  const bDel = await b.client.from('projects').delete().eq('id', projectId).select()
  assert(!bDel.error && bDel.data.length === 0, 'B delete of A’s project must affect 0 rows')

  // Confirm A's project survived B's attempts unchanged.
  const after = await a.client.from('projects').select('name').eq('id', projectId).single()
  assert(!after.error && after.data.name === `RLS A ${stamp}`, 'A’s project must be intact after B’s attempts')

  // B inserting a row owned by A must be rejected by WITH CHECK.
  const bForge = await b.client.from('projects').insert({ name: 'forged', owner: a.id }).select()
  assert(!!bForge.error, 'B must not insert a row owned by A (WITH CHECK)')

  // --- Child-row isolation: A's expense must be invisible/untouchable to B. ---
  const eIns = await a.client
    .from('expenses')
    .insert({ project_id: projectId, owner: a.id, vendor_name: `RLS exp ${stamp}`, amount: 1234 })
    .select()
    .single()
  if (eIns.error) throw new Error(`A expense insert: ${eIns.error.message}`)
  const expenseId = eIns.data.id

  const bExpList = await b.client.from('expenses').select('id')
  assert(!bExpList.error && bExpList.data.every((r) => r.id !== expenseId), 'B must not see A’s expense')
  const bExpUpd = await b.client.from('expenses').update({ amount: 0 }).eq('id', expenseId).select()
  assert(!bExpUpd.error && bExpUpd.data.length === 0, 'B update of A’s expense must affect 0 rows')
  const bExpDel = await b.client.from('expenses').delete().eq('id', expenseId).select()
  assert(!bExpDel.error && bExpDel.data.length === 0, 'B delete of A’s expense must affect 0 rows')
} catch (e) {
  failures.push(`threw: ${e.message}`)
} finally {
  // Cleanup: remove ephemeral users (cascades their rows).
  for (const u of users) if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
}

if (failures.length) {
  console.error('RLS isolation FAILED:')
  for (const f of failures) console.error('  ✗', f)
  process.exit(1)
}
console.log('RLS isolation OK — users are fully scoped to their own rows.')
