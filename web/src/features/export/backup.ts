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

function omitMeta(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row }
  delete copy.id
  delete copy.owner
  return copy
}
const stripMeta = (rows: Array<Record<string, unknown>>) => rows.map(omitMeta)

/** Restore a backup as a NEW project (owned by the current user via RLS). Returns the
 *  new project id. Child rows are re-pointed at the new project. */
export async function restoreBackup(json: string): Promise<string> {
  const file = JSON.parse(json) as BackupFile
  if (!file.project) throw new Error('Not a valid project backup')

  const projectFields = omitMeta(file.project as unknown as Record<string, unknown>)
  const newProject = await table<{ id: string }>('projects').create({
    ...projectFields,
    name: `${file.project.name} (restored)`,
  } as never)
  const pid = newProject.id

  const insertAll = async (name: string, rows: object[]) => {
    for (const row of stripMeta(rows as Array<Record<string, unknown>>)) {
      await table(name).create({ ...row, projectId: pid } as never)
    }
  }

  // Order matters only loosely (no FKs between children); projects first (done).
  await insertAll('budget_categories', file.categories)
  await insertAll('budget_line_items', file.lineItems)
  await insertAll('vendors', file.vendors)
  await insertAll('expenses', file.expenses)
  await insertAll('change_orders', file.changeOrders)
  await insertAll('allowance_selections', file.allowanceSelections)
  await insertAll('project_tasks', file.tasks)
  await insertAll('bid_packages', file.bidPackages)
  await insertAll('bids', file.bids)
  await insertAll('photo_attachments', file.photos)
  await insertAll('project_documents', file.documents)

  return pid
}
