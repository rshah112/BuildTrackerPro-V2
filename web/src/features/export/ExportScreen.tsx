import { useRef, useState } from 'react'
import {
  FileSpreadsheet,
  FileText,
  Download,
  Upload,
  CloudUpload,
  FileArchive,
  FileUp,
  CloudDownload,
  RotateCcw,
  Trash2,
  ShieldCheck,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/Confirm'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useProjects } from '../projects/useProjects'
import { downloadBackup, restoreBackup } from './backup'
import {
  backupToCloud,
  deleteCloudBackup,
  downloadCloudBackup,
  listCloudBackups,
  restoreCloudBackup,
} from './cloudBackup'
import type { CloudBackupRecord } from '../../domain/types'

// xlsx (~430KB) and jspdf (~350KB) are loaded on demand the first time the user actually
// exports, not when the Export screen mounts — keeping them out of every other chunk.
const loadWorkbook = () => import('./workbook').then((m) => m.downloadWorkbook)
const loadInsightsPdf = () => import('./insightsPdf').then((m) => m.downloadInsightsPdf)
const loadBundle = () => import('./bundle').then((m) => m.downloadBundle)
const loadWorkbookImport = () => import('./workbookImport').then((m) => m.importWorkbookUpdates)

export function ExportScreen() {
  const { projectId: selectedProjectId } = useCurrentProject()
  const { data: projects = [] } = useProjects()
  // `/export` is intentionally not RequireProject-gated. Treat a stale local selection
  // (for example, the project was just permanently deleted) as no active project.
  const projectId = projects.some((project) => project.id === selectedProjectId && !project.deletedAt)
    ? selectedProjectId
    : null
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const xlsxRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const cloudQuery = useQuery({
    queryKey: ['cloud-backups', 'account'],
    queryFn: () => listCloudBackups(),
  })

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message || 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const onRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await run(
      'restore',
      async () => {
        const text = await file.text()
        await restoreBackup(text)
        await queryClient.invalidateQueries()
      },
      'Backup restored as a new project',
    )
  }

  const onWorkbookFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !projectId) return
    setBusy('import')
    try {
      const res = await (await loadWorkbookImport())(projectId, file)
      await queryClient.invalidateQueries()
      const parts = [`${res.lineItemsUpdated} line item${res.lineItemsUpdated === 1 ? '' : 's'} updated`]
      if (res.categoriesUpdated) parts.push(`${res.categoriesUpdated} categor${res.categoriesUpdated === 1 ? 'y' : 'ies'}`)
      if (res.unmatched) parts.push(`${res.unmatched} row${res.unmatched === 1 ? '' : 's'} unmatched`)
      toast.success(parts.join(' · '))
    } catch (err) {
      toast.error((err as Error).message || 'Couldn’t read that workbook')
    } finally {
      setBusy(null)
    }
  }

  const refreshCloudHistory = () =>
    queryClient.invalidateQueries({ queryKey: ['cloud-backups', 'account'] })

  const restoreCloud = async (record: CloudBackupRecord) => {
    const ok = await confirm({
      title: 'Restore this snapshot?',
      message: 'A separate restored project will be created. Your current project will not change.',
      confirmLabel: 'Restore copy',
    })
    if (!ok) return
    await run(
      `cloud-restore-${record.id}`,
      async () => {
        await restoreCloudBackup(record)
        await queryClient.invalidateQueries()
      },
      'Cloud snapshot verified and restored as a new project',
    )
  }

  const removeCloud = async (record: CloudBackupRecord) => {
    const ok = await confirm({
      title: 'Delete cloud snapshot?',
      message: 'This permanently removes the snapshot and cannot be undone.',
      confirmLabel: 'Delete snapshot',
      destructive: true,
    })
    if (!ok) return
    await run(
      `cloud-delete-${record.id}`,
      async () => {
        await deleteCloudBackup(record)
        await refreshCloudHistory()
      },
      'Cloud snapshot deleted',
    )
  }

  return (
    <section>
      <ScreenHeader title="Recovery center" subtitle="Reports, portable archives, and integrity-protected cloud snapshots" />

      <div className="backup-assurance" role="status">
        <span className="backup-assurance-icon"><ShieldCheck size={22} aria-hidden /></span>
        <span>
          <strong>Layered project protection</strong>
          <small>Cloud snapshots include active and trashed records. SHA-256 checks are verified before every download or restore.</small>
        </span>
      </div>

      {projectId ? (
        <>
          <h2 className="section-label">Reports</h2>
          <div className="export-actions">
            <Button
              variant="secondary"
              fullWidth
              loading={busy === 'xlsx'}
              leadingIcon={<FileSpreadsheet size={18} />}
              onClick={() => run('xlsx', async () => (await loadWorkbook())(projectId), 'Excel workbook downloaded')}
            >
              Export Excel workbook
            </Button>
            <Button
              variant="secondary"
              fullWidth
              loading={busy === 'pdf'}
              leadingIcon={<FileText size={18} />}
              onClick={() => run('pdf', async () => (await loadInsightsPdf())(projectId), 'PDF report downloaded')}
            >
              Export PDF report
            </Button>
            <Button
              variant="secondary"
              fullWidth
              loading={busy === 'bundle'}
              leadingIcon={<FileArchive size={18} />}
              onClick={() => run('bundle', async () => (await loadBundle())(projectId), 'Recovery bundle downloaded')}
            >
              Download full recovery bundle
            </Button>
          </div>

          <h2 className="section-label">Back up current project</h2>
          <div className="export-actions">
            <Button
              variant="secondary"
              fullWidth
              loading={busy === 'cloud'}
              leadingIcon={<CloudUpload size={18} />}
              onClick={() =>
                run(
                  'cloud',
                  async () => {
                    await backupToCloud(projectId)
                    await refreshCloudHistory()
                  },
                  'Cloud snapshot created with integrity protection',
                )
              }
            >
              Back up to cloud now
            </Button>
            <Button
              variant="secondary"
              fullWidth
              loading={busy === 'backup'}
              leadingIcon={<Download size={18} />}
              onClick={() => run('backup', () => downloadBackup(projectId), 'Backup downloaded')}
            >
              Download JSON backup
            </Button>
            <Button
              variant="secondary"
              fullWidth
              loading={busy === 'import'}
              leadingIcon={<FileUp size={18} />}
              onClick={() => xlsxRef.current?.click()}
            >
              Update budgets from workbook
            </Button>
          </div>
        </>
      ) : (
        <p className="muted">No active project is selected. You can still recover any account snapshot or JSON backup below.</p>
      )}

      <h2 className="section-label">Restore</h2>
      <div className="export-actions">
        <Button
          variant="secondary"
          fullWidth
          loading={busy === 'restore'}
          leadingIcon={<Upload size={18} />}
          onClick={() => fileRef.current?.click()}
        >
          Restore from backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onRestoreFile}
        />
        <input
          ref={xlsxRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: 'none' }}
          onChange={onWorkbookFile}
        />
      </div>

      <h2 className="section-label">Cloud snapshot history</h2>
      <div className="backup-history" aria-live="polite">
        {cloudQuery.isLoading && <p className="muted backup-history-message">Loading snapshots…</p>}
        {cloudQuery.isError && (
          <p className="backup-history-message danger-text">Snapshot history is temporarily unavailable.</p>
        )}
        {!cloudQuery.isLoading && !cloudQuery.isError && cloudQuery.data?.length === 0 && (
          <p className="muted backup-history-message">
            {projectId
              ? 'No cloud snapshots in this account yet. Create one above to test recovery.'
              : 'No cloud snapshots are available in this account. You can still restore a JSON backup above.'}
          </p>
        )}
        {cloudQuery.data?.map((record) => (
          <article className="backup-history-row" key={record.id}>
            <span className="backup-history-main">
              <strong>{record.projectName || 'Deleted project'}</strong>
              <small>
                {new Date(record.createdAt).toLocaleString()} · {record.itemCount.toLocaleString()} records ·{' '}
                {(record.sizeBytes / 1024).toFixed(1)} KB · SHA-256 protected
              </small>
            </span>
            <span className="backup-history-actions">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Download snapshot from ${new Date(record.createdAt).toLocaleString()}`}
                title="Download snapshot"
                loading={busy === `cloud-download-${record.id}`}
                onClick={() =>
                  run(
                    `cloud-download-${record.id}`,
                    () => downloadCloudBackup(record),
                    'Cloud snapshot verified and downloaded',
                  )
                }
              >
                <CloudDownload size={17} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Restore snapshot from ${new Date(record.createdAt).toLocaleString()}`}
                title="Restore a copy"
                loading={busy === `cloud-restore-${record.id}`}
                onClick={() => restoreCloud(record)}
              >
                <RotateCcw size={17} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Delete snapshot from ${new Date(record.createdAt).toLocaleString()}`}
                title="Delete snapshot"
                loading={busy === `cloud-delete-${record.id}`}
                onClick={() => removeCloud(record)}
              >
                <Trash2 size={17} aria-hidden />
              </Button>
            </span>
          </article>
        ))}
      </div>
      <p className="muted">
        Restore always creates a separate project, so the current one is left untouched. Daily snapshots
        run while you use the app. The recovery bundle includes JSON data, Excel, receipts, documents,
        bid files, and photos. Workbook updates only change matched budgets; they never add or delete rows.
      </p>
    </section>
  )
}
