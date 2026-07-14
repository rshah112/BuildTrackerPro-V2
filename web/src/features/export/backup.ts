import { toSnake } from '../../lib/casing'
import { isNetworkError, isRetryablePostgrestError } from '../../lib/netStatus'
import { supabase } from '../../lib/supabase'
import { loadProjectExport, downloadBlob, safeFileName, type ProjectExport } from './exportData'

export const BACKUP_VERSION = 2
const MAX_BACKUP_CHARS = 50 * 1024 * 1024
const MAX_BACKUP_ROWS = 100_000

export interface BackupFile extends ProjectExport {
  backupVersion: number
}

const COLLECTIONS = [
  'categories',
  'lineItems',
  'expenses',
  'changeOrders',
  'allowanceSelections',
  'vendors',
  'tasks',
  'bidPackages',
  'bids',
  'photos',
  'documents',
  'loans',
  'loanDraws',
  'phases',
  'lienWaivers',
] as const

type CollectionName = (typeof COLLECTIONS)[number]
type Row = Record<string, unknown>

export interface PreparedRestore {
  backupVersion: number
  project: Row
  categories: Row[]
  lineItems: Row[]
  expenses: Row[]
  changeOrders: Row[]
  allowanceSelections: Row[]
  vendors: Row[]
  tasks: Row[]
  bidPackages: Row[]
  bids: Row[]
  photos: Row[]
  documents: Row[]
  loans: Row[]
  loanDraws: Row[]
  phases: Row[]
  lienWaivers: Row[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Validate and normalize a backup before any database write happens. Version 1
 *  files remain supported; they predate lien-waiver export, so that list is empty. */
export function parseBackup(json: string): BackupFile {
  if (json.length > MAX_BACKUP_CHARS) throw new Error('Backup is larger than the 50 MB restore limit')

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('This file is not valid JSON')
  }
  if (!isRecord(raw) || !isRecord(raw.project)) throw new Error('Not a valid project backup')
  const version = Number(raw.backupVersion)
  if (version !== 1 && version !== BACKUP_VERSION) {
    throw new Error(`Backup version ${String(raw.backupVersion)} is not supported`)
  }
  if (typeof raw.project.id !== 'string' || typeof raw.project.name !== 'string') {
    throw new Error('Backup project metadata is incomplete')
  }
  if (typeof raw.exportedAt !== 'string') throw new Error('Backup export date is missing')

  let rowCount = 0
  for (const name of COLLECTIONS) {
    if (name === 'lienWaivers' && version === 1 && raw[name] === undefined) raw[name] = []
    if (!Array.isArray(raw[name])) throw new Error(`Backup section “${name}” is missing or invalid`)
    if (!(raw[name] as unknown[]).every(isRecord)) throw new Error(`Backup section “${name}” contains invalid rows`)
    rowCount += (raw[name] as unknown[]).length
  }
  if (rowCount > MAX_BACKUP_ROWS) throw new Error('Backup contains too many records to restore safely')
  return raw as unknown as BackupFile
}

export function makeBackupFile(data: ProjectExport): BackupFile {
  return { backupVersion: BACKUP_VERSION, ...data }
}

export function backupItemCount(file: Pick<BackupFile, CollectionName>): number {
  return COLLECTIONS.reduce((total, name) => total + file[name].length, 0)
}

/** Download a full JSON snapshot of the project (all entities). */
export async function downloadBackup(projectId: string): Promise<void> {
  // 'all' → a full backup includes trashed (soft-deleted) rows, not just active ones.
  const data = await loadProjectExport(projectId, { trashed: 'all' })
  const file = makeBackupFile(data)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${safeFileName(data.project.name)}-backup-${data.exportedAt.slice(0, 10)}.json`)
}

function omitMeta(row: Row): Row {
  const copy = { ...row }
  delete copy.id
  delete copy.owner
  return copy
}

function mapIds(rows: unknown[], section: string): Map<string, string> {
  const ids = new Map<string, string>()
  for (const row of rows as Row[]) {
    if (typeof row.id !== 'string' || !row.id) throw new Error(`Backup section “${section}” has a row without an id`)
    if (ids.has(row.id)) throw new Error(`Backup section “${section}” contains duplicate ids`)
    ids.set(row.id, crypto.randomUUID())
  }
  return ids
}

function remapOptional(ids: Map<string, string>, value: unknown): string | null {
  return typeof value === 'string' ? ids.get(value) ?? null : null
}

function remapRequired(ids: Map<string, string>, value: unknown, label: string): string {
  const mapped = remapOptional(ids, value)
  if (!mapped) throw new Error(`Backup contains a ${label} that does not exist in the backup`)
  return mapped
}

function preparedRows(
  rows: unknown[],
  ids: Map<string, string>,
  projectId: string,
  defaults: Row,
  patch?: (row: Row) => Row,
): Row[] {
  return (rows as Row[]).map((row) => ({
    ...defaults,
    ...omitMeta(row),
    ...(patch?.(row) ?? {}),
    id: ids.get(row.id as string),
    projectId,
  }))
}

/** Build a complete, allow-listed restore payload and remap every internal id before
 *  the transactional RPC starts. Missing required references fail before any write. */
export function prepareRestore(file: BackupFile): PreparedRestore {
  const now = new Date().toISOString()
  const projectId = crypto.randomUUID()
  const categoryIds = mapIds(file.categories, 'categories')
  const lineIds = mapIds(file.lineItems, 'lineItems')
  const expenseIds = mapIds(file.expenses, 'expenses')
  const changeOrderIds = mapIds(file.changeOrders, 'changeOrders')
  const allowanceIds = mapIds(file.allowanceSelections, 'allowanceSelections')
  const vendorIds = mapIds(file.vendors, 'vendors')
  const taskIds = mapIds(file.tasks, 'tasks')
  const packageIds = mapIds(file.bidPackages, 'bidPackages')
  const bidIds = mapIds(file.bids, 'bids')
  const photoIds = mapIds(file.photos, 'photos')
  const documentIds = mapIds(file.documents, 'documents')
  const loanIds = mapIds(file.loans, 'loans')
  const drawIds = mapIds(file.loanDraws, 'loanDraws')
  const phaseIds = mapIds(file.phases, 'phases')
  const waiverIds = mapIds(file.lienWaivers, 'lienWaivers')

  const project: Row = {
    address: '', status: 'planning', priority: 'normal', templateType: 'custom', purchasePrice: 0,
    closingCosts: 0, squareFootage: null, lotDimensions: '', proposedBuildDimensions: '', footprint: '',
    stories: 0, basement: '', scopeSummary: '', warrantyNotes: '', startDate: null, targetFinishDate: null,
    constructionBudget: 0, contingencyBudget: 0, createdAt: now,
    ...omitMeta(file.project as unknown as Row),
    id: projectId,
    name: `${file.project.name} (restored)`,
    deletedAt: null,
  }

  return {
    backupVersion: BACKUP_VERSION,
    project,
    categories: preparedRows(file.categories, categoryIds, projectId, {
      name: '', sortOrder: 0, targetBudget: 0, systemImage: '', deletedAt: null,
    }),
    lineItems: preparedRows(file.lineItems, lineIds, projectId, {
      costCode: '', title: '', categoryName: '', roomTag: '', budget: 0, actual: 0, committed: 0,
      notes: '', isPinned: false, isAllowance: false, allowanceAmount: 0, createdAt: now, deletedAt: null,
    }, () => ({ actual: 0 })),
    expenses: preparedRows(file.expenses, expenseIds, projectId, {
      amount: 0, amountPaid: 0, vendorName: '', vendorId: null, invoiceNumber: '', date: now,
      dueDate: null, expectedPaymentDate: null, paidDate: null, paymentMethod: '', paymentReference: '',
      categoryName: '', roomTag: '', budgetLineItemId: null, budgetLineItemTitle: '', changeOrderId: null,
      notes: '', isPaid: true, receiptObjectKey: null, fundingSource: '', retainageAmount: 0, deletedAt: null,
    }, (row) => ({
      budgetLineItemId: remapOptional(lineIds, row.budgetLineItemId),
      vendorId: remapOptional(vendorIds, row.vendorId),
      changeOrderId: remapOptional(changeOrderIds, row.changeOrderId),
    })),
    changeOrders: preparedRows(file.changeOrders, changeOrderIds, projectId, {
      title: '', amount: 0, status: 'pending', notes: '', categoryName: '', budgetLineItemId: null,
      budgetLineItemTitle: '', createdAt: now, expectedPaymentDate: null, deletedAt: null,
    }, (row) => ({ budgetLineItemId: remapOptional(lineIds, row.budgetLineItemId) })),
    allowanceSelections: preparedRows(file.allowanceSelections, allowanceIds, projectId, {
      lineItemId: null, selectionDate: now, vendor: '', amount: 0, notes: '', photoObjectKey: null,
      deletedAt: null,
    }, (row) => ({ lineItemId: remapRequired(lineIds, row.lineItemId, 'selection line item') })),
    vendors: preparedRows(file.vendors, vendorIds, projectId, {
      name: '', trade: '', phone: '', email: '', notes: '', taxId: '', licenseNumber: '',
      insuranceExpiry: null, deletedAt: null,
    }),
    tasks: preparedRows(file.tasks, taskIds, projectId, {
      title: '', status: 'todo', dueDate: null, vendorId: null, budgetLineItemId: null, photoIds: [],
      notes: '', createdAt: now, completedAt: null, deletedAt: null,
    }, (row) => ({
      vendorId: remapOptional(vendorIds, row.vendorId),
      budgetLineItemId: remapOptional(lineIds, row.budgetLineItemId),
      photoIds: Array.isArray(row.photoIds)
        ? row.photoIds.flatMap((id) => remapOptional(photoIds, id) ?? [])
        : [],
    })),
    bidPackages: preparedRows(file.bidPackages, packageIds, projectId, {
      scopeTitle: '', dueDate: null, status: 'open', awardedBidId: null, createdAt: now, notes: '',
      deletedAt: null,
    }, (row) => ({ awardedBidId: remapOptional(bidIds, row.awardedBidId) })),
    bids: preparedRows(file.bids, bidIds, projectId, {
      packageId: null, vendorId: null, vendorName: '', amount: 0, fileObjectKey: null, fileName: '',
      notes: '', lineItems: [], createdAt: now, awardedAt: null, deletedAt: null,
    }, (row) => ({
      packageId: remapRequired(packageIds, row.packageId, 'bid package'),
      vendorId: remapOptional(vendorIds, row.vendorId),
    })),
    photos: preparedRows(file.photos, photoIds, projectId, {
      imageObjectKey: null, createdAt: now, roomTag: '', phaseTag: '', categoryName: '',
      budgetLineItemId: null, notes: '', deletedAt: null,
    }, (row) => ({ budgetLineItemId: remapOptional(lineIds, row.budgetLineItemId) })),
    documents: preparedRows(file.documents, documentIds, projectId, {
      fileName: '', kind: 'other', status: 'received', notes: '', budgetLineItemId: null,
      budgetLineItemTitle: '', uploadedAt: now, fileObjectKey: null, deletedAt: null,
    }, (row) => ({ budgetLineItemId: remapOptional(lineIds, row.budgetLineItemId) })),
    loans: preparedRows(file.loans, loanIds, projectId, {
      lender: '', totalAmount: 0, interestRate: 0, notes: '', createdAt: now, deletedAt: null,
    }),
    loanDraws: preparedRows(file.loanDraws, drawIds, projectId, {
      loanId: null, amount: 0, drawDate: now, description: '', notes: '', createdAt: now, deletedAt: null,
    }, (row) => ({ loanId: remapRequired(loanIds, row.loanId, 'construction loan') })),
    phases: preparedRows(file.phases, phaseIds, projectId, {
      name: '', pctComplete: 0, sortOrder: 0, targetDate: null, notes: '', createdAt: now, deletedAt: null,
    }),
    lienWaivers: preparedRows(file.lienWaivers, waiverIds, projectId, {
      vendorName: '', expenseId: null, amount: 0, waiverType: 'conditional_progress', throughDate: null,
      received: false, notes: '', createdAt: now, deletedAt: null,
    }, (row) => ({ expenseId: remapOptional(expenseIds, row.expenseId) })),
  }
}

/** Restore as a NEW project in one authenticated PostgreSQL transaction. This deliberately
 *  bypasses the normal offline table wrapper: a restore is never queued or reported as
 *  successful unless the complete server transaction returns successfully. */
export async function restoreBackup(json: string): Promise<string> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Reconnect before restoring a backup so the transaction can be verified')
  }

  const payload = prepareRestore(parseBackup(json))
  try {
    const { data, error, status } = await supabase.rpc('restore_project_backup', {
      payload: toSnake(payload),
    })
    if (error) {
      if (isRetryablePostgrestError(error, status)) {
        throw new Error('Restore could not be confirmed. Reconnect and check Projects before retrying.', { cause: error })
      }
      throw new Error(`Restore was rolled back: ${error.message || 'the server rejected the backup'}`, { cause: error })
    }
    if (typeof data !== 'string' || !data) throw new Error('Restore completed without a project id')
    return data
  } catch (error) {
    if (isNetworkError(error)) {
      throw new Error('Restore could not be confirmed. Reconnect and check Projects before retrying.', { cause: error })
    }
    throw error
  }
}
