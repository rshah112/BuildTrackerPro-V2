// Creates a friend's auth user (idempotent) and pre-populates ONE templated project
// (pool or deck) with categories + line items, into the buildtracker schema. Inserts
// as the authenticated user so RLS sets owner = auth.uid().
//
// Run:
//   SUPABASE_URL=.. SUPABASE_ANON_KEY=.. SUPABASE_SERVICE_ROLE=.. \
//   FRIEND=kyle node web/scripts/seed-friend.mjs
//   FRIEND=mihir node web/scripts/seed-friend.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
const which = (process.env.FRIEND || '').toLowerCase()

if (!url || !anon || !which) {
  console.error('Need SUPABASE_URL, SUPABASE_ANON_KEY, FRIEND=kyle|mihir')
  process.exit(1)
}

// share = relative weight; line-item budget = round(total * share / sumShares), cents-safe-ish.
const FRIENDS = {
  kyle: {
    email: 'kyle@buildtracker.app',
    password: 'password',
    total: 120000,
    project: {
      name: 'Backyard Pool',
      template_type: 'poolBackyard',
      status: 'active',
      priority: 'high',
      scope_summary: 'New in-ground pool, patio, and outdoor living build in the backyard.',
      construction_budget: 120000,
      contingency_budget: 18000,
    },
    categories: [
      { name: 'Design & Permits', icon: 'doc', items: [['Design and Layout', 2], ['Engineering and Permits', 3], ['Survey and Markout', 1]] },
      { name: 'Demo & Site Prep', icon: 'hammer', items: [['Demo and Clearing', 3], ['Access, Protection and Haul-Off', 3], ['Rough Grading', 2]] },
      { name: 'Excavation', icon: 'shovel', items: [['Pool Excavation', 7], ['Soil Export and Backfill', 3]] },
      { name: 'Pool Shell', icon: 'circle', items: [['Steel, Forms and Shell', 11], ['Waterproofing and Interior Finish', 4.5], ['Tile and Coping Prep', 2.5], ['Pool Cover', 2]] },
      { name: 'Plumbing & Equipment', icon: 'droplet', items: [['Pool Plumbing', 5.5], ['Pump, Filter and Heater', 5.5], ['Automation and Startup', 3.5], ['Solar Pool Heating', 1.5]] },
      { name: 'Electrical & Lighting', icon: 'zap', items: [['Electrical Rough-In', 3.5], ['Pool and Landscape Lighting', 2.5], ['Outdoor Speakers / AV Rough-In', 1]] },
      { name: 'Hardscape', icon: 'grid', items: [['Patio Base and Pavers', 9], ['Coping and Masonry', 4], ['Drainage', 2]] },
      { name: 'Landscaping & Finish', icon: 'leaf', items: [['Plantings, Sod and Mulch', 4.5], ['Pool Safety Fence and Gate', 3.5], ['Pool Alarm and Safety Equipment', 0.5], ['Furniture, Cleanup and Final', 3.5]] },
      { name: 'Outdoor Living', icon: 'flame', items: [['Outdoor Kitchen or Bar', 2.5], ['Pergola or Shade Structure', 1], ['Outdoor TV and Entertainment', 0.8], ['Fire Feature or Extras', 1.2]] },
    ],
  },
  mihir: {
    email: 'mihir@buildtracker.app',
    password: 'password',
    total: 45000,
    project: {
      name: 'Backyard Deck',
      template_type: 'deckPatio',
      status: 'active',
      priority: 'high',
      scope_summary: 'New multi-level deck with railings, stairs, and lighting off the back of the house.',
      construction_budget: 45000,
      contingency_budget: 6000,
    },
    categories: [
      { name: 'Design & Permits', icon: 'doc', items: [['Design and Permit', 5], ['Survey or Plot Plan', 3]] },
      { name: 'Demo & Prep', icon: 'hammer', items: [['Demo and Disposal', 5], ['Layout, Protection and Access', 5]] },
      { name: 'Footings', icon: 'box', items: [['Excavation and Footings', 9], ['Concrete and Inspection', 5]] },
      { name: 'Framing', icon: 'frame', items: [['Framing Material', 12], ['Framing Labor', 10]] },
      { name: 'Decking / Surface', icon: 'grid', items: [['Decking or Paver Material', 10], ['Installation', 7], ['Built-In Benches or Seating', 2], ['Built-In Planters', 1]] },
      { name: 'Rails, Stairs & Finish', icon: 'ruler', items: [['Railings', 7], ['Stairs', 5], ['Ground-Level Landing Pad', 1.5], ['Pergola or Shade Structure', 1.5], ['Trim, Fascia and Finish', 3]] },
      { name: 'Lighting & Cleanup', icon: 'lightbulb', items: [['Deck Lighting', 2.5], ['Outdoor Electrical and GFI Outlets', 2], ['Outdoor Ceiling Fan', 0.5], ['Final Clean and Punch List', 3]] },
    ],
  },
}

const cfg = FRIENDS[which]
if (!cfg) {
  console.error('FRIEND must be kyle or mihir')
  process.exit(1)
}

// 1) Create the user via the public signup endpoint (this project auto-confirms email).
//    Idempotent: an existing user just fails signup, then we sign in below.
const supa = createClient(url, anon, { db: { schema: 'buildtracker' }, auth: { persistSession: false } })
const { error: signUpErr } = await supa.auth.signUp({ email: cfg.email, password: cfg.password })
if (signUpErr && !/already|registered|exists/i.test(signUpErr.message)) {
  console.error('signup failed:', signUpErr.message)
  process.exit(1)
}

// 2) Sign in as the user so RLS owns the rows.
const { error: signInErr } = await supa.auth.signInWithPassword({ email: cfg.email, password: cfg.password })
if (signInErr) {
  console.error('sign-in failed:', signInErr.message)
  process.exit(1)
}
console.log('user ready:', cfg.email)

const { data: existing } = await supa.from('projects').select('id').eq('name', cfg.project.name).limit(1)
if (existing && existing.length) {
  console.log('project already exists, skipping:', cfg.project.name)
  process.exit(0)
}

// 3) Compute line-item budgets from shares, distributing exactly to the total.
const totalShares = cfg.categories.reduce((s, c) => s + c.items.reduce((cs, [, sh]) => cs + sh, 0), 0)
const perShare = cfg.total / totalShares
const round100 = (n) => Math.round(n / 100) * 100 // round to nearest $100 for clean values

const { data: proj, error: pErr } = await supa
  .from('projects')
  .insert(cfg.project)
  .select('id')
  .single()
if (pErr) {
  console.error('project insert failed:', pErr.message)
  process.exit(1)
}
const projectId = proj.id

const categoryRows = cfg.categories.map((c, i) => ({
  project_id: projectId,
  name: c.name,
  sort_order: i,
  target_budget: round100(c.items.reduce((s, [, sh]) => s + sh * perShare, 0)),
  system_image: c.icon,
}))
const { error: cErr } = await supa.from('budget_categories').insert(categoryRows)
if (cErr) {
  console.error('categories insert failed:', cErr.message)
  process.exit(1)
}

const lineRows = cfg.categories.flatMap((c, ci) =>
  c.items.map(([title, share], idx) => ({
    project_id: projectId,
    category_name: c.name,
    cost_code: `${String(ci + 1).padStart(2, '0')}-${String((idx + 1) * 10).padStart(3, '0')}`,
    title,
    budget: round100(share * perShare),
    committed: 0,
    actual: 0,
    is_allowance: false,
    allowance_amount: 0,
  })),
)
const { error: lErr } = await supa.from('budget_line_items').insert(lineRows)
if (lErr) {
  console.error('line items insert failed:', lErr.message)
  process.exit(1)
}

const sum = lineRows.reduce((s, r) => s + r.budget, 0)
console.log(`seeded "${cfg.project.name}" for ${cfg.email}: ${categoryRows.length} categories, ${lineRows.length} line items, $${sum.toLocaleString()} allocated`)
