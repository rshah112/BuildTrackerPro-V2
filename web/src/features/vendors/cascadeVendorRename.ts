import { supabase } from '../../lib/supabase'

// Expenses and allowance selections link to a vendor by NAME (not id), so when a vendor profile is
// renamed, propagate the new name to those rows (scoped to this project + the exact old name) so the
// Vendor 360 rollup and the lists stay in sync. RLS scopes every update to the owner. Best-effort:
// rows typed with different casing won't match an exact rename, which is acceptable.
export async function cascadeVendorRename(projectId: string, oldName: string, newName: string): Promise<void> {
  const from = oldName.trim()
  const to = newName.trim()
  if (!from || from === to) return
  await Promise.all([
    supabase.from('expenses').update({ vendor_name: to }).eq('project_id', projectId).eq('vendor_name', from),
    supabase.from('allowance_selections').update({ vendor: to }).eq('project_id', projectId).eq('vendor', from),
  ])
}
