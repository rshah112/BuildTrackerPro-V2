import { table } from '../../data/table'
import { loadProjectExport, downloadBlob, safeFileName, type ProjectExport } from './exportData'

const BACKUP_VERSION = 1

interface BackupFile extends ProjectExport {
  backupVersion: number
}

/** Download a full JSON snapshot of the project (all entities). */
export async function downloadBackup(projectId: string): Promise<void> {
  const data = await loadProjectExport(projectId)
  const file: BackupFile = { backupVersion: BACKUP_VERSION, ...data }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${safeFileName(data.project.name)}-backup-${data.exportedAt.slice(0, 10)}.json`)
}

type Row = Record<string, unknown>

function omitMeta(row: Row): Row {
  const copy = { ...row }
  delete copy.id
  delete copy.owner
  return copy
}

/** Restore a backup as a NEW project (owned by the current user via RLS). Child rows
 *  are re-pointed at the new project AND their cross-entity id references (line item,
 *  vendor, package, awarded bid, task photos) are remapped to the newly-created ids so
 *  the restored project's internal linkage stays intact instead of dangling at the
 *  source project's UUIDs. */
export async function restoreBackup(json: string): Promise<string> {
  const file = JSON.parse(json) as BackupFile
  if (!file.project) throw new Error('Not a valid project backup')

  const projectFields = omitMeta(file.project as unknown as Row)
  const newProject = await table<{ id: string }>('projects').create({
    ...projectFields,
    name: `${file.project.name} (restored)`,
  } as never)
  const pid = newProject.id

  // Insert a table's rows, capturing oldId -> newId. `patch` rewrites foreign refs
  // using maps built from earlier inserts.
  const insertMapped = async (
    name: string,
    rows: unknown[] = [],
    patch?: (clean: Row) => Row,
  ): Promise<Map<string, string>> => {
    const map = new Map<string, string>()
    for (const raw of rows as Row[]) {
      const oldId = raw.id as string | undefined
      const clean = omitMeta(raw)
      const created = await table<{ id: string }>(name).create({
        ...clean,
        ...(patch ? patch(clean) : {}),
        projectId: pid,
      } as never)
      if (oldId) map.set(oldId, created.id)
    }
    return map
  }

  const remap = (m: Map<string, string>, v: unknown): string | null =>
    typeof v === 'string' && m.has(v) ? (m.get(v) as string) : null

  await insertMapped('budget_categories', file.categories)
  const lineMap = await insertMapped('budget_line_items', file.lineItems)
  const vendorMap = await insertMapped('vendors', file.vendors)
  const photoMap = await insertMapped('photo_attachments', file.photos, (r) => ({
    budgetLineItemId: remap(lineMap, r.budgetLineItemId),
  }))

  // Packages first (awardedBidId cleared — bids don't exist yet), patched after bids.
  const pkgMap = await insertMapped('bid_packages', file.bidPackages, () => ({ awardedBidId: null }))
  const bidMap = await insertMapped('bids', file.bids, (r) => ({
    packageId: remap(pkgMap, r.packageId) ?? (r.packageId as string),
    vendorId: remap(vendorMap, r.vendorId),
  }))
  for (const pkg of (file.bidPackages ?? []) as unknown as Row[]) {
    const newPkg = remap(pkgMap, pkg.id)
    const newBid = remap(bidMap, pkg.awardedBidId)
    if (newPkg && newBid) await table('bid_packages').update(newPkg, { awardedBidId: newBid } as never)
  }

  await insertMapped('expenses', file.expenses, (r) => ({ budgetLineItemId: remap(lineMap, r.budgetLineItemId) }))
  await insertMapped('change_orders', file.changeOrders, (r) => ({
    budgetLineItemId: remap(lineMap, r.budgetLineItemId),
  }))
  await insertMapped('allowance_selections', file.allowanceSelections, (r) => ({
    lineItemId: remap(lineMap, r.lineItemId) ?? (r.lineItemId as string),
  }))
  await insertMapped('project_tasks', file.tasks, (r) => ({
    vendorId: remap(vendorMap, r.vendorId),
    budgetLineItemId: remap(lineMap, r.budgetLineItemId),
    photoIds: Array.isArray(r.photoIds)
      ? r.photoIds.flatMap((id) => {
          const n = photoMap.get(id as string)
          return n ? [n] : []
        })
      : [],
  }))
  await insertMapped('project_documents', file.documents, (r) => ({
    budgetLineItemId: remap(lineMap, r.budgetLineItemId),
  }))

  // Construction loan (+ its draws, re-pointed at the new loan id).
  const loanMap = await insertMapped('construction_loans', file.loans)
  await insertMapped('loan_draws', file.loanDraws, (r) => ({
    loanId: remap(loanMap, r.loanId) ?? (r.loanId as string),
  }))

  // Build phases (project-scoped only — no cross-entity refs to remap).
  await insertMapped('phases', file.phases)

  return pid
}
