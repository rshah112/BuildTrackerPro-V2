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
  LoanDraw,
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
  exportedAt: string
}

/** Loads every row for a project (RLS-scoped to the owner) for export/backup. */
export async function loadProjectExport(projectId: string): Promise<ProjectExport> {
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
  ] = await Promise.all([
    table<Project>('projects').get(projectId),
    table<BudgetCategory>('budget_categories').list(f),
    table<BudgetLineItem>('budget_line_items').list(f),
    table<Expense>('expenses').list(f),
    table<ChangeOrder>('change_orders').list(f),
    table<AllowanceSelection>('allowance_selections').list(f),
    table<Vendor>('vendors').list(f),
    table<ProjectTask>('project_tasks').list(f),
    table<BidPackage>('bid_packages').list(f),
    table<Bid>('bids').list(f),
    table<PhotoAttachment>('photo_attachments').list(f),
    table<ProjectDocument>('project_documents').list(f),
    table<ConstructionLoan>('construction_loans').list(f),
    table<LoanDraw>('loan_draws').list(f),
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
