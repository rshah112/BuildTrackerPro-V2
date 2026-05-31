import { loadProjectExport } from './exportData'
import { uploadBlob } from '../../lib/r2'

// Independent, durable safety net: a full JSON snapshot of the project pushed to R2
// (object storage, separate from Postgres). Layered on top of soft-delete + Supabase's
// managed backups so the data lives in more than one place. Best-effort and non-blocking —
// a backup failure must never disrupt the app.

const LAST_KEY = (pid: string) => `btp.lastCloudBackup.${pid}`
const DAY_MS = 86_400_000

/** Force a snapshot now. Returns the R2 object key. */
export async function backupToCloud(projectId: string): Promise<string> {
  const data = await loadProjectExport(projectId)
  const blob = new Blob([JSON.stringify({ backupVersion: 1, ...data })], { type: 'application/json' })
  const { key } = await uploadBlob(blob, 'backup')
  try {
    localStorage.setItem(LAST_KEY(projectId), String(Date.now()))
  } catch {
    /* ignore storage quota/availability */
  }
  return key
}

/** Run a snapshot at most once per day per project. Swallows all errors. */
export async function maybeAutoBackup(projectId: string): Promise<void> {
  try {
    const last = Number(localStorage.getItem(LAST_KEY(projectId)) || 0)
    if (Date.now() - last < DAY_MS) return
    await backupToCloud(projectId)
  } catch {
    /* never disrupt the app over a background backup */
  }
}
