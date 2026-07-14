import { table } from '../../data/table'
import type { CloudBackupRecord } from '../../domain/types'
import { toCamel, toSnake } from '../../lib/casing'
import { deleteBlob, signedDownloadUrl, uploadBlob } from '../../lib/r2'
import { supabase } from '../../lib/supabase'
import { backupItemCount, makeBackupFile, restoreBackup } from './backup'
import { downloadBlob, loadProjectExport, safeFileName } from './exportData'

// Independent, durable safety net: a full JSON snapshot of the project pushed to R2
// (object storage, separate from Postgres). The catalog in Postgres makes every object
// visible and recoverable; a bounded retention policy prevents indefinite orphan growth.

const LAST_KEY = (pid: string) => `btp.lastCloudBackup.${pid}`
const DAY_MS = 86_400_000
const RETAIN_PER_PROJECT = 30

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function verifiedBackupBlob(record: CloudBackupRecord): Promise<Blob> {
  const url = await signedDownloadUrl(record.objectKey)
  if (!url) throw new Error('Backup object is missing')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Backup download failed (${response.status})`)
  const blob = await response.blob()
  if (record.sizeBytes > 0 && blob.size !== record.sizeBytes) {
    throw new Error('Backup size check failed; the snapshot may be incomplete')
  }
  if (record.checksum && (await sha256(blob)) !== record.checksum) {
    throw new Error('Backup integrity check failed; the snapshot was not restored')
  }
  return blob
}

/** Account-wide by default so a source project's snapshots remain visible after that
 *  project is permanently deleted. Pass a project id only for retention housekeeping. */
export async function listCloudBackups(projectId?: string): Promise<CloudBackupRecord[]> {
  const rows = await table<CloudBackupRecord>('backup_catalog').list(projectId ? { projectId } : undefined)
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Permanently remove a cataloged snapshot and its object bytes. */
export async function deleteCloudBackup(record: CloudBackupRecord): Promise<void> {
  await deleteBlob(record.objectKey)
  await table('backup_catalog').purge(record.id)
}

async function pruneOldBackups(projectId: string): Promise<void> {
  const stale = (await listCloudBackups(projectId)).slice(RETAIN_PER_PROJECT)
  // Retention is housekeeping, never a reason to mark the fresh snapshot failed.
  await Promise.allSettled(stale.map(deleteCloudBackup))
}

/** Force a complete snapshot now. Returns its searchable catalog record. */
export async function backupToCloud(projectId: string): Promise<CloudBackupRecord> {
  const data = await loadProjectExport(projectId, { trashed: 'all' })
  const file = makeBackupFile(data)
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const checksum = await sha256(blob)
  const { key } = await uploadBlob(blob, 'backup')

  let record: CloudBackupRecord
  try {
    const input = {
      projectId,
      projectName: data.project.name,
      objectKey: key,
      backupVersion: file.backupVersion,
      sizeBytes: blob.size,
      checksum,
      itemCount: backupItemCount(file),
    }
    // Catalog creation is recovery-critical and must never enter the ordinary offline
    // outbox. Only report the snapshot created after Postgres confirms the metadata row.
    const { data: catalogRow, error } = await supabase
      .from('backup_catalog')
      .insert(toSnake(input) as never)
      .select()
      .single()
    if (error || !catalogRow) throw new Error(error?.message || 'Cloud snapshot cataloging failed')
    record = toCamel<CloudBackupRecord>(catalogRow)
  } catch (error) {
    // Never leave an anonymous object if cataloging fails.
    await deleteBlob(key).catch(() => undefined)
    throw error
  }

  try {
    localStorage.setItem(LAST_KEY(projectId), String(Date.now()))
  } catch {
    /* ignore storage quota/availability */
  }
  void pruneOldBackups(projectId)
  return record
}

export async function downloadCloudBackup(record: CloudBackupRecord): Promise<void> {
  const blob = await verifiedBackupBlob(record)
  downloadBlob(blob, `${safeFileName(record.projectName)}-cloud-backup-${record.createdAt.slice(0, 10)}.json`)
}

export async function restoreCloudBackup(record: CloudBackupRecord): Promise<string> {
  const blob = await verifiedBackupBlob(record)
  return restoreBackup(await blob.text())
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
