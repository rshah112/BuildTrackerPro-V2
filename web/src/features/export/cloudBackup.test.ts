import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudBackupRecord } from '../../domain/types'
import { listCloudBackups } from './cloudBackup'

const { listMock, tableMock } = vi.hoisted(() => {
  const listMock = vi.fn()
  return {
    listMock,
    tableMock: vi.fn(() => ({ list: listMock })),
  }
})

vi.mock('../../data/table', () => ({ table: tableMock }))
vi.mock('../../lib/r2', () => ({
  deleteBlob: vi.fn(),
  signedDownloadUrl: vi.fn(),
  uploadBlob: vi.fn(),
}))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

const record = (id: string, projectId: string, createdAt: string): CloudBackupRecord => ({
  id,
  owner: 'owner-1',
  projectId,
  projectName: `Project ${projectId}`,
  objectKey: `backup/${id}`,
  backupVersion: 2,
  sizeBytes: 100,
  checksum: 'abc',
  itemCount: 1,
  createdAt,
  deletedAt: null,
})

describe('cloud backup catalog', () => {
  beforeEach(() => {
    listMock.mockReset()
    tableMock.mockClear()
  })

  it('lists the account-wide catalog by default, including snapshots from deleted projects', async () => {
    listMock.mockResolvedValue([
      record('old', 'deleted-project', '2026-01-01T00:00:00Z'),
      record('new', 'current-project', '2026-07-13T00:00:00Z'),
    ])

    await expect(listCloudBackups()).resolves.toEqual([
      expect.objectContaining({ id: 'new' }),
      expect.objectContaining({ id: 'old', projectId: 'deleted-project' }),
    ])
    expect(tableMock).toHaveBeenCalledWith('backup_catalog')
    expect(listMock).toHaveBeenCalledWith(undefined)
  })

  it('can still scope by project for per-project retention pruning', async () => {
    listMock.mockResolvedValue([])
    await listCloudBackups('project-1')
    expect(listMock).toHaveBeenCalledWith({ projectId: 'project-1' })
  })
})
