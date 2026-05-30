import { useRef, useState } from 'react'
import { FileSpreadsheet, FileText, Download, Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { downloadWorkbook } from './workbook'
import { downloadInsightsPdf } from './insightsPdf'
import { downloadBackup, restoreBackup } from './backup'

export function ExportScreen() {
  const { projectId } = useCurrentProject()
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
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
          onClick={() => run('xlsx', () => downloadWorkbook(projectId), 'Excel workbook downloaded')}
        >
          Export Excel workbook
        </Button>
        <Button
          variant="secondary"
          fullWidth
          loading={busy === 'pdf'}
          leadingIcon={<FileText size={18} />}
          onClick={() => run('pdf', () => downloadInsightsPdf(projectId), 'PDF report downloaded')}
        >
          Export PDF report
        </Button>
      </div>

      <h2 className="section-label">Backup</h2>
      <div className="export-actions">
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
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onRestoreFile}
        />
      </div>
      <p className="muted">Restore creates a new project from the file — your current project is left untouched.</p>
    </section>
  )
}
