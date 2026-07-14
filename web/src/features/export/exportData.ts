import { table } from '../../data/table'
import type {
  AllowanceSelection,
  Bid,
  BidPackage,
  BudgetCategory,
  BudgetLineItem,
  ChangeOrder,
  ConstructionLoan,
  Expense,
  LienWaiver,
  LoanDraw,
  Phase,
  PhotoAttachment,
  Project,
  ProjectDocument,
  ProjectTask,
  Vendor,
} from '../../domain/types'

export interface ProjectExport {
  project: Project
  categories: BudgetCategory[]
  lineItems: BudgetLineItem[]
  expenses: Expense[]
  changeOrders: ChangeOrder[]
  allowanceSelections: AllowanceSelection[]
  vendors: Vendor[]
  tasks: ProjectTask[]
  bidPackages: BidPackage[]
  bids: Bid[]
  photos: PhotoAttachment[]
  documents: ProjectDocument[]
  loans: ConstructionLoan[]
  loanDraws: LoanDraw[]
  phases: Phase[]
  lienWaivers: LienWaiver[]
  exportedAt: string
}

/** Loads every row for a project (RLS-scoped to the owner) for export/backup. `trashed`
 *  defaults to 'exclude' (active rows only) for the Excel/PDF reports; the JSON backup passes
 *  'all' so a "full backup" actually captures soft-deleted (trashed) rows too. */
export async function loadProjectExport(
  projectId: string,
  opts?: { trashed?: 'exclude' | 'only' | 'all' },
): Promise<ProjectExport> {
  const f = { projectId }
  const [
    project,
    categories,
    lineItems,
    expenses,
    changeOrders,
    allowanceSelections,
    vendors,
    tasks,
    bidPackages,
    bids,
    photos,
    documents,
    loans,
    loanDraws,
    phases,
    lienWaivers,
  ] = await Promise.all([
    table<Project>('projects').get(projectId),
    table<BudgetCategory>('budget_categories').list(f, opts),
    table<BudgetLineItem>('budget_line_items').list(f, opts),
    table<Expense>('expenses').list(f, opts),
    table<ChangeOrder>('change_orders').list(f, opts),
    table<AllowanceSelection>('allowance_selections').list(f, opts),
    table<Vendor>('vendors').list(f, opts),
    table<ProjectTask>('project_tasks').list(f, opts),
    table<BidPackage>('bid_packages').list(f, opts),
    table<Bid>('bids').list(f, opts),
    table<PhotoAttachment>('photo_attachments').list(f, opts),
    table<ProjectDocument>('project_documents').list(f, opts),
    table<ConstructionLoan>('construction_loans').list(f, opts),
    table<LoanDraw>('loan_draws').list(f, opts),
    table<Phase>('phases').list(f, opts),
    table<LienWaiver>('lien_waivers').list(f, opts),
  ])

  if (!project) throw new Error('Project not found')

  return {
    project,
    categories,
    lineItems,
    expenses,
    changeOrders,
    allowanceSelections,
    vendors,
    tasks,
    bidPackages,
    bids,
    photos,
    documents,
    loans,
    loanDraws,
    phases,
    lienWaivers,
    exportedAt: new Date().toISOString(),
  }
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFileName(name: string): string {
  return (name || 'project').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'project'
}
