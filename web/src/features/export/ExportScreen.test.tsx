// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../components/ui/Confirm'
import { ToastProvider } from '../../components/ui/Toast'
import type { CloudBackupRecord } from '../../domain/types'
import { ExportScreen } from './ExportScreen'

const { listCloudBackupsMock, projectState } = vi.hoisted(() => ({
  listCloudBackupsMock: vi.fn(),
  projectState: { projectId: 'current-project' as string | null, projects: [] as Array<{ id: string; deletedAt: string | null }> },
}))

vi.mock('../projects/currentProject', () => ({
  useCurrentProject: () => ({ projectId: projectState.projectId, setProjectId: vi.fn() }),
}))

vi.mock('../projects/useProjects', () => ({
  useProjects: () => ({ data: projectState.projects }),
}))

vi.mock('./cloudBackup', () => ({
  backupToCloud: vi.fn(),
  deleteCloudBackup: vi.fn(),
  downloadCloudBackup: vi.fn(),
  listCloudBackups: listCloudBackupsMock,
  restoreCloudBackup: vi.fn(),
}))

const snapshots: CloudBackupRecord[] = [
  {
    id: 'backup-1',
    owner: 'owner-1',
    projectId: 'deleted-project',
    projectName: 'Former build',
    objectKey: 'backup/1',
    backupVersion: 2,
    sizeBytes: 2048,
    checksum: 'checksum',
    itemCount: 42,
    createdAt: '2026-07-13T12:00:00Z',
    deletedAt: null,
  },
]

describe('Recovery center cloud history', () => {
  beforeEach(() => {
    projectState.projectId = 'current-project'
    projectState.projects = [{ id: 'current-project', deletedAt: null }]
    listCloudBackupsMock.mockResolvedValue(snapshots)
  })

  it('shows account-wide snapshots with truthful pre-download integrity wording', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <ExportScreen />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Former build')).toBeInTheDocument()
    expect(screen.getByText(/SHA-256 protected/)).toBeInTheDocument()
    expect(screen.getByText(/verified before every download or restore/i)).toBeInTheDocument()
    expect(listCloudBackupsMock).toHaveBeenCalledWith()
    expect(screen.queryByText(/ · verified$/i)).not.toBeInTheDocument()
  })

  it('remains usable with no active project and does not offer actions for a stale selection', async () => {
    projectState.projectId = 'deleted-project'
    projectState.projects = []
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <ExportScreen />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Former build')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore from backup' })).toBeInTheDocument()
    expect(screen.getByText(/No active project is selected/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back up to cloud now' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export Excel workbook' })).not.toBeInTheDocument()
  })
})
