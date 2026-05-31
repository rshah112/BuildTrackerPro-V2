import { useRef, useState } from 'react'
import { FileSpreadsheet, FileText, Download, Upload, CloudUpload, FileArchive, FileUp } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { downloadBackup, restoreBackup } from './backup'
import { backupToCloud } from './cloudBackup'

// xlsx (~430KB) and jspdf (~350KB) are loaded on demand the first time the user actually
// exports, not when the Export screen mounts — keeping them out of every other chunk.
const loadWorkbook = () => import('./workbook').then((m) => m.downloadWorkbook)
const loadInsightsPdf = () => import('./insightsPdf').then((m) => m.downloadInsightsPdf)
const loadBundle = () => import('./bundle').then((m) => m.downloadBundle)
const loadWorkbookImport = () => import('./workbookImport').then((m) => m.importWorkbookUpdates)

export function ExportScreen() {
  const { projectId } = useCurrentProject()
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const xlsxRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (!projectId) return null

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

  return (
    <section>
      <ScreenHeader title="Export & backup" subtitle="Download your project or save a full backup" />

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
          onClick={() => run('bundle', async () => (await loadBundle())(projectId), 'Export bundle downloaded')}
        >
          Download .zip bundle
        </Button>
      </div>

      <h2 className="section-label">Backup</h2>
      <div className="export-actions">
        <Button
          variant="secondary"
          fullWidth
          loading={busy === 'cloud'}
          leadingIcon={<CloudUpload size={18} />}
          onClick={() => run('cloud', () => backupToCloud(projectId), 'Backed up to the cloud')}
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
          loading={busy === 'restore'}
          leadingIcon={<Upload size={18} />}
          onClick={() => fileRef.current?.click()}
        >
          Restore from backup
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
      <p className="muted">
        Restore creates a new project from the file — your current project is left untouched. The app
        also snapshots this project to secure cloud storage automatically once a day. “Update budgets
        from workbook” re-imports an exported Excel file to update existing line-item and category
        budgets (it never adds or deletes rows).
      </p>
    </section>
  )
}
