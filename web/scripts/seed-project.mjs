// Seeds one comprehensive custom-home construction project (categories + line items)
// for a single user, into the `buildtracker` schema. Inserts as the authenticated
// user so RLS sets `owner = auth.uid()` automatically — no service role needed.
//
// Run (prod):
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_ANON_KEY=<anon> \
//   SEED_EMAIL=you@example.com SEED_PASSWORD=*** \
//   node web/scripts/seed-project.mjs
//
// Idempotent: skips if a project named PROJECT.name already exists for the user.

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
const email = process.env.SEED_EMAIL
const password = process.env.SEED_PASSWORD

if (!url || !anon || !email || !password) {
  console.error('Need SUPABASE_URL, SUPABASE_ANON_KEY, SEED_EMAIL, SEED_PASSWORD')
  process.exit(1)
}

const PROJECT = {
  name: 'New Home Construction',
  address: '',
  status: 'active',
  priority: 'high',
  template_type: 'customHome',
  square_footage: 6000,
  construction_budget: 1300000,
  contingency_budget: 200000,
  stories: 2,
  basement: 'Full basement',
  scope_summary:
    'Approx. 6,000 sq ft two-story custom home plus full basement on a new foundation. $1.3M construction budget with $200k contingency.',
}

// Industry-standard residential new-construction breakdown. Line-item budgets sum to
// exactly $1,300,000. `a` marks an allowance item (you finalize the selection later).
const BUDGET = [
  { code: '01', name: 'General Requirements & Soft Costs', icon: 'clipboard', items: [
    { t: 'Building permits & fees', b: 16000 },
    { t: 'Architectural & engineering', b: 22000 },
    { t: 'Survey & soil testing', b: 6000 },
    { t: "Builder's risk insurance", b: 8000 },
    { t: 'Temporary utilities & facilities', b: 6000 },
  ]},
  { code: '02', name: 'Site Work & Excavation', icon: 'shovel', items: [
    { t: 'Clearing & demolition', b: 10000 },
    { t: 'Excavation & rough grading', b: 26000 },
    { t: 'Utility trenching & connections', b: 24000 },
    { t: 'Backfill & compaction', b: 8000 },
    { t: 'Erosion control & final grade', b: 10000 },
  ]},
  { code: '03', name: 'Foundation & Concrete', icon: 'box', items: [
    { t: 'Footings', b: 18000 },
    { t: 'Basement foundation walls', b: 48000 },
    { t: 'Basement slab', b: 16000 },
    { t: 'Waterproofing & damp-proofing', b: 12000 },
    { t: 'Foundation drainage & sump', b: 8000 },
    { t: 'Garage slab & exterior flatwork', b: 13000 },
  ]},
  { code: '04', name: 'Framing & Structural', icon: 'frame', items: [
    { t: 'Lumber & material package', b: 82000 },
    { t: 'Framing labor', b: 66000 },
    { t: 'Roof trusses & rafters', b: 20000 },
    { t: 'Structural steel & beams', b: 9000 },
    { t: 'Sheathing & house wrap', b: 8000 },
  ]},
  { code: '05', name: 'Roofing', icon: 'home', items: [
    { t: 'Roofing material', b: 24000 },
    { t: 'Roofing labor', b: 11000 },
    { t: 'Flashing & ventilation', b: 5000 },
  ]},
  { code: '06', name: 'Exterior Finishes', icon: 'layers', items: [
    { t: 'Siding (material & labor)', b: 40000 },
    { t: 'Stone / brick veneer', b: 22000 },
    { t: 'Soffit, fascia & gutters', b: 10000 },
    { t: 'Exterior trim & caulking', b: 6000 },
  ]},
  { code: '07', name: 'Windows & Exterior Doors', icon: 'square', items: [
    { t: 'Windows', b: 38000 },
    { t: 'Exterior doors', b: 10000 },
    { t: 'Garage doors', b: 8000 },
  ]},
  { code: '08', name: 'Plumbing', icon: 'droplet', items: [
    { t: 'Plumbing rough-in', b: 28000 },
    { t: 'Plumbing fixtures', b: 20000, a: true },
    { t: 'Water heaters', b: 7000 },
    { t: 'Finish plumbing labor', b: 11000 },
  ]},
  { code: '09', name: 'HVAC', icon: 'wind', items: [
    { t: 'HVAC equipment', b: 34000 },
    { t: 'Ductwork & venting', b: 20000 },
    { t: 'Controls & finish', b: 10000 },
  ]},
  { code: '10', name: 'Electrical', icon: 'zap', items: [
    { t: 'Electrical rough-in', b: 26000 },
    { t: 'Fixtures & devices', b: 16000, a: true },
    { t: 'Finish electrical labor', b: 10000 },
    { t: 'Low-voltage / data / security', b: 8000 },
  ]},
  { code: '11', name: 'Insulation', icon: 'thermometer', items: [
    { t: 'Wall & attic insulation', b: 18000 },
    { t: 'Spray foam / rim & basement', b: 10000 },
  ]},
  { code: '12', name: 'Drywall', icon: 'square', items: [
    { t: 'Drywall material', b: 18000 },
    { t: 'Hang, tape & finish labor', b: 28000 },
  ]},
  { code: '13', name: 'Interior Trim & Millwork', icon: 'ruler', items: [
    { t: 'Interior doors', b: 14000 },
    { t: 'Base, casing & crown', b: 20000 },
    { t: 'Stairs & railings', b: 16000 },
    { t: 'Built-ins & custom millwork', b: 10000 },
  ]},
  { code: '14', name: 'Cabinetry & Countertops', icon: 'archive', items: [
    { t: 'Kitchen cabinets', b: 34000 },
    { t: 'Bath & utility cabinets', b: 14000 },
    { t: 'Countertops', b: 25000, a: true },
    { t: 'Cabinet hardware', b: 5000 },
  ]},
  { code: '15', name: 'Flooring', icon: 'grid', items: [
    { t: 'Hardwood flooring', b: 32000 },
    { t: 'Tile', b: 18000, a: true },
    { t: 'Carpet', b: 8000 },
    { t: 'Floor prep & underlayment', b: 6000 },
  ]},
  { code: '16', name: 'Painting', icon: 'paintbucket', items: [
    { t: 'Interior paint & finish', b: 28000 },
    { t: 'Exterior paint & stain', b: 12000 },
  ]},
  { code: '17', name: 'Appliances', icon: 'refrigerator', items: [
    { t: 'Kitchen appliances', b: 26000, a: true },
    { t: 'Laundry appliances', b: 8000 },
  ]},
  { code: '18', name: 'Interior Specialties', icon: 'star', items: [
    { t: 'Fireplace(s)', b: 16000 },
    { t: 'Closet & storage systems', b: 8000 },
    { t: 'Bath accessories & mirrors', b: 6000 },
    { t: 'Window treatments', b: 6000, a: true },
  ]},
  { code: '19', name: 'Landscaping & Hardscape', icon: 'trees', items: [
    { t: 'Driveway', b: 22000 },
    { t: 'Patios, walkways & decks', b: 18000 },
    { t: 'Landscaping, sod & plantings', b: 10000 },
    { t: 'Irrigation', b: 6000 },
  ]},
  { code: '20', name: 'Final, Cleanup & Supervision', icon: 'check', items: [
    { t: 'General supervision & overhead', b: 40000 },
    { t: 'Final cleaning', b: 7000 },
    { t: 'Waste removal & dumpsters', b: 7000 },
    { t: 'Punch list & misc', b: 4000 },
  ]},
]

const supa = createClient(url, anon, {
  db: { schema: 'buildtracker' },
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error: authErr } = await supa.auth.signInWithPassword({ email, password })
if (authErr) {
  console.error('sign-in failed:', authErr.message)
  process.exit(1)
}

const { data: existing } = await supa.from('projects').select('id').eq('name', PROJECT.name).limit(1)
if (existing && existing.length) {
  console.log('project already exists, skipping:', PROJECT.name)
  process.exit(0)
}

const total = BUDGET.reduce((s, c) => s + c.items.reduce((cs, i) => cs + i.b, 0), 0)
console.log('seeding', PROJECT.name, '— line-item total $' + total.toLocaleString())

const { data: proj, error: pErr } = await supa.from('projects').insert(PROJECT).select('id').single()
if (pErr) {
  console.error('project insert failed:', pErr.message)
  process.exit(1)
}
const projectId = proj.id

const categories = BUDGET.map((c, i) => ({
  project_id: projectId,
  name: c.name,
  sort_order: i,
  target_budget: c.items.reduce((s, it) => s + it.b, 0),
  system_image: c.icon,
}))
const { error: cErr } = await supa.from('budget_categories').insert(categories)
if (cErr) {
  console.error('categories insert failed:', cErr.message)
  process.exit(1)
}

const lineItems = BUDGET.flatMap((c) =>
  c.items.map((it, idx) => ({
    project_id: projectId,
    category_name: c.name,
    cost_code: `${c.code}-${String((idx + 1) * 10).padStart(3, '0')}`,
    title: it.t,
    budget: it.b,
    committed: 0,
    actual: 0,
    is_allowance: !!it.a,
    allowance_amount: it.a ? it.b : 0,
  })),
)
const { error: lErr } = await supa.from('budget_line_items').insert(lineItems)
if (lErr) {
  console.error('line items insert failed:', lErr.message)
  process.exit(1)
}

console.log(`done: ${categories.length} categories, ${lineItems.length} line items.`)
