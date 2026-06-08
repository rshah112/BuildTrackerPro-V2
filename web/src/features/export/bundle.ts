import { loadProjectExport, downloadBlob, safeFileName } from './exportData'
import { workbookBuffer } from './workbook'
import { makeZip } from '../../lib/zip'

// Bundles the full JSON backup AND the Excel workbook into a single .zip download, so the
// user gets one self-contained "everything" file. Media stays in R2 (referenced by key);
// this mirrors the JSON backup's scope. Loads the project once and reuses it for both files.
const BACKUP_VERSION = 1

export async function downloadBundle(projectId: string): Promise<void> {
  // Full snapshot (incl. trashed rows) for the JSON backup; active-only for the Excel report.
  const [full, report] = await Promise.all([
    loadProjectExport(projectId, { trashed: 'all' }),
    loadProjectExport(projectId),
  ])
  const base = safeFileName(full.project.name)
  const date = full.exportedAt.slice(0, 10)
  const json = JSON.stringify({ backupVersion: BACKUP_VERSION, ...full }, null, 2)

  const zip = makeZip([
    { name: `${base}-backup-${date}.json`, data: new TextEncoder().encode(json) },
    { name: `${base}-${date}.xlsx`, data: new Uint8Array(workbookBuffer(report)) },
  ])
  downloadBlob(zip, `${base}-export-${date}.zip`)
}
